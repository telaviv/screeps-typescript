import semverGte from 'semver/functions/gte'

import * as Logger from 'utils/logger'
import { ConstructionFeaturesV3, getConstructionFeaturesV3 } from 'construction-features'
import { ENEMY_DISTANCE_BUFFER, MAX_CLAIM_DISTANCE } from '../constants'
import { OwnedRoomProgress, World } from 'utils/world'
import {
    findSpawnRooms,
    getRoomType,
    getSources,
    getWallTerrainCount,
    hasNoSpawns,
    RoomType,
} from 'utils/room'
import { mprofile, profile } from 'utils/profiling'
import { Position } from 'types'
import { RoomManager } from './room-manager'
import { createTravelTask } from 'tasks/travel'
import { getNonObstacleNeighbors } from 'utils/room-position'
import { getScouts } from 'utils/creep'
import { isTravelTask } from 'tasks/travel/utils'

/** Current version of scout data format */
const SCOUT_VERSION = '1.1.0'

/** Maximum distance to scout from owned rooms */
const MAX_SCOUT_DISTANCE = MAX_CLAIM_DISTANCE + ENEMY_DISTANCE_BUFFER
/** Average seconds per tick on shard 0 */
const TIME_PER_TICK = 4.7 // seconds on shard 0
/** Time-to-live for scout data by room distance (in ticks) */
export const DistanceTTL: Record<number, number> = {
    1: (60 * 60 * 24) / TIME_PER_TICK,
    2: (60 * 60 * 24) / TIME_PER_TICK,
    3: (60 * 60 * 36) / TIME_PER_TICK,
    4: (60 * 60 * 36) / TIME_PER_TICK,
    5: (60 * 60 * 48) / TIME_PER_TICK,
}

if (Object.keys(DistanceTTL).length < MAX_SCOUT_DISTANCE) {
    throw new Error('DistanceTTL is not fully defined')
}

/** Default expiration TTL for scout data (48 hours in ticks) */
export const EXPIRATION_TTL = !Game.cpu.generatePixel
    ? (60 * 60 * 48) / 0.2
    : (60 * 60 * 48) / TIME_PER_TICK

/** Memory structure for storing scout data about a room */
/** Memory structure for storing scout data about a room */
export interface ScoutMemory {
    /** Scout data format version */
    version: string
    /** Game tick when data was recorded */
    updatedAt: number
    /** Username of controller owner, if any */
    controllerOwner?: string
    /** Controller progress total */
    controllerProgress?: number
    /** Whether room has an invader core */
    hasInvaderCore?: boolean
    /** Username of enemy mining in the room */
    enemyThatsMining?: string
    /** Number of energy sources */
    sourceCount?: number
    /** Whether controller has no accessible positions */
    controllerBlocked?: boolean
    /** Count of wall terrain tiles */
    wallTerrain?: number
    /** Positions of each source */
    sourcePositions?: Record<Id<Source>, Position>
    /** Position of the controller */
    controllerPosition?: Position
    /** Position of the mineral */
    mineralPosition?: Position
    /** Remaining safe mode ticks */
    safeMode?: number
}

declare global {
    interface RoomMemory {
        /** Scout data for this room */
        scout?: ScoutMemory
    }

    namespace NodeJS {
        interface Global {
            /** Console utilities for scouting */
            scout: {
                /** Shows the next room to scout */
                next: () => void
                /** Shows current scout creep location */
                location: () => void
                /** Immediately scout a room */
                now: (destination: string, start: string) => void
                /** Clear the closest room cache */
                clearCache: () => void
                /** Debug room status and memory */
                debug: (roomName: string) => void
            }
        }
    }
}

/** Console utilities for scouting operations */
global.scout = {
    /** Shows the next room to scout */
    next: () => {
        const scoutManager = ScoutManager.create()
        const room = scoutManager.findNextRoomToScout()
        console.log(`next room to scout: ${room}`)
    },
    /** Shows current scout creep location */
    location: () => {
        const creep = Object.values(Game.creeps).find((c) => c.memory.role === 'scout')
        if (creep) {
            console.log(`scout location: ${creep.pos}`)
        } else {
            console.log('no scout currently')
        }
    },
    /** Immediately adds a scout task for a room */
    now: (destination: string, start: string): void => {
        new RoomManager(Game.rooms[start]).addScoutRoomTask(destination)
    },
    /** Clear the closest room cache */
    clearCache: (): void => {
        World.clearClosestRoomCache()
        console.log('Closest room cache cleared')
    },
    /** Debug room status and memory */
    debug: (roomName: string): void => {
        console.log(`=== Debug info for ${roomName} ===`)
        console.log(`Room type: ${getRoomType(roomName)}`)
        console.log(`Room status: ${Game.map.getRoomStatus(roomName).status}`)
        console.log(
            `Has construction features: ${!!Memory.rooms[roomName]?.constructionFeaturesV3}`,
        )
        console.log(`Has scout data: ${!!Memory.rooms[roomName]?.scout}`)
        if (Memory.rooms[roomName]?.scout) {
            console.log(`Scout data:`, JSON.stringify(Memory.rooms[roomName].scout))
        }
        const exits = Game.map.describeExits(roomName)
        console.log(`Adjacent rooms:`, JSON.stringify(exits))
    },
}

/**
 * Manages scouting operations to gather intel about nearby rooms.
 * Records room data and coordinates scout creep assignments.
 */
class ScoutManager {
    /** World map utility for room calculations */
    private world: World
    /** Progress totals for owned rooms */
    private ownedRoomProgress: OwnedRoomProgress
    /** Construction features data by room name */
    private featureRoomData: Record<string, ConstructionFeaturesV3>
    /** Current game tick */
    private gameTime: number

    /**
     * Creates a new ScoutManager.
     * @param world - World map utility
     * @param ownedRoomProgress - Map of room names to progress totals
     * @param featureRoomData - Construction features by room
     * @param gameTime - Current game tick
     */
    constructor(
        world: World,
        ownedRoomProgress: Map<string, number>,
        featureRoomData: Record<string, ConstructionFeaturesV3>,
        gameTime: number = Game.time,
    ) {
        this.world = world
        this.ownedRoomProgress = ownedRoomProgress
        this.featureRoomData = featureRoomData
        this.gameTime = gameTime
    }

    /** Factory method to create a ScoutManager with current game state */
    static create(): ScoutManager {
        const world = new World()
        const ownedRoomProgress = new Map<string, number>()
        const scoutRoomData: Record<string, ScoutMemory> = {}
        const featureRoomData: Record<string, ConstructionFeaturesV3> = {}
        for (const room of findSpawnRooms()) {
            if (room.controller?.my) {
                ownedRoomProgress.set(room.name, room.controller.progressTotal)
            }
        }
        for (const [name, memory] of Object.entries(Memory.rooms)) {
            if (memory.scout) {
                scoutRoomData[name] = memory.scout
            }
            const features = getConstructionFeaturesV3(name)
            if (features) {
                featureRoomData[name] = features
            }
        }
        return new ScoutManager(world, ownedRoomProgress, featureRoomData)
    }

    /** Gets list of owned room names */
    get ownedRooms(): string[] {
        return Array.from(this.ownedRoomProgress.keys())
    }

    /** Main scout manager loop - records data and dispatches scouts */
    @profile
    run(): void {
        this.clearExpiredScoutData()
        for (const room of Object.values(Game.rooms)) {
            this.recordScoutData(room)
        }
        const roomToScout = this.findNextRoomToScout()
        if (!roomToScout) {
            return
        }
        const scouts = getScouts()
        if (
            scouts.some((scout) =>
                scout.memory.tasks.some(
                    (task) => isTravelTask(task) && task.destination === roomToScout,
                ),
            )
        ) {
            return
        }
        if (scouts.length > 0) {
            const task = createTravelTask(scouts[0].name, roomToScout)
            scouts[0].memory.tasks.push(task)
            return
        }
        if (RoomManager.getAllScoutTasks().some((task) => task.data.room === roomToScout)) {
            return
        }
        const scoutRoom = this.findBestRoomToCreateScout(roomToScout)
        if (!scoutRoom) {
            Logger.warning('scout-manager:run:no-scout-room:', roomToScout)
            return
        }
        Logger.warning('scout-manager:run:scout-room:', scoutRoom, roomToScout)
        new RoomManager(Game.rooms[scoutRoom]).addScoutRoomTask(roomToScout)
    }

    /** Finds the next room that needs scouting */
    @profile
    findNextRoomToScout(): string | null {
        const closestRooms = this.world.getClosestRooms(this.ownedRooms, MAX_SCOUT_DISTANCE)
        Logger.debug(
            'scout-manager:findNextRoomToScout:closestRooms',
            closestRooms.length,
            this.ownedRooms,
        )

        for (const { roomName, distance } of closestRooms) {
            const roomType = getRoomType(roomName)
            const hasFeatures = !!this.featureRoomData[roomName]
            const hasValidScout = this.hasValidScoutData(roomName)

            Logger.debug('scout-manager:checking', roomName, {
                distance,
                roomType,
                hasFeatures,
                hasValidScout,
            })

            if (roomType !== RoomType.ROOM) {
                continue
            }
            if (roomType === RoomType.ROOM && (!hasFeatures || !hasValidScout)) {
                Logger.debug('scout-manager:findNextRoomToScout:found', roomName)
                return roomName
            }
        }
        Logger.debug('scout-manager:findNextRoomToScout:none-found')
        return null
    }

    /**
     * Finds the best owned room to spawn a scout from.
     * @param roomName - Target room to scout
     */
    @profile
    findBestRoomToCreateScout(roomName: string): string | null {
        return this.world.findBestOwnedRoom(roomName, MAX_SCOUT_DISTANCE, this.ownedRoomProgress, {
            filter: (name) => !hasNoSpawns(Game.rooms[name]),
        })
    }

    /**
     * Checks if a room has valid, non-expired scout data.
     * @param roomName - Room to check
     */
    private hasValidScoutData(roomName: string): boolean {
        const memory = Memory.rooms[roomName]
        return Boolean(
            memory &&
                memory.scout &&
                memory.scout.updatedAt &&
                memory.scout.updatedAt + EXPIRATION_TTL >= this.gameTime &&
                semverGte(memory.scout.version, SCOUT_VERSION),
        )
    }

    /** Clears expired scout data from memory */
    @profile
    clearExpiredScoutData(): void {
        for (const name of Object.keys(Memory.rooms)) {
            if (!this.hasValidScoutData(name)) {
                delete Memory.rooms[name]
            }
        }
    }

    /**
     * Records scout data for a visible room.
     * @param room - The room to record data for
     */
    @mprofile('scout-manager:record-scout-data')
    private recordScoutData(room: Room): void {
        const scoutMemory: ScoutMemory = room.memory.scout ?? ({} as ScoutMemory)
        const controller = room.controller
        if (controller && controller.owner) {
            scoutMemory.controllerOwner = controller.owner.username
            scoutMemory.controllerProgress = controller.progressTotal
        } else {
            scoutMemory.hasInvaderCore = ScoutManager.hasInvaderCore(room)
            scoutMemory.enemyThatsMining = ScoutManager.enemyThatsMining(room)
        }
        const sources = getSources(room)
        scoutMemory.sourceCount = sources.length
        scoutMemory.sourcePositions = {}
        for (const source of sources) {
            scoutMemory.sourcePositions[source.id] = { x: source.pos.x, y: source.pos.y }
        }
        scoutMemory.wallTerrain = getWallTerrainCount(room)
        if (controller) {
            scoutMemory.controllerPosition = { x: controller.pos.x, y: controller.pos.y }
            scoutMemory.controllerBlocked = getNonObstacleNeighbors(controller.pos).length === 0
        }
        const mineral = room.find(FIND_MINERALS)[0]
        if (mineral) {
            scoutMemory.mineralPosition = { x: mineral.pos.x, y: mineral.pos.y }
        }
        scoutMemory.version = SCOUT_VERSION
        scoutMemory.updatedAt = this.gameTime
        if (controller?.safeMode) {
            scoutMemory.safeMode = controller.safeMode
        }
        room.memory.scout = scoutMemory
    }

    /**
     * Checks if a room has an invader core.
     * @param room - The room to check
     */
    private static hasInvaderCore(room: Room): boolean {
        const invaderCores = room.find(FIND_STRUCTURES, {
            filter: { structureType: STRUCTURE_INVADER_CORE },
        })
        return invaderCores ? invaderCores.length > 0 : false
    }

    /**
     * Gets the username of an enemy mining in the room.
     * @param room - The room to check
     * @returns Enemy username or undefined
     */
    private static enemyThatsMining(room: Room): string | undefined {
        const sources = room.find(FIND_SOURCES)
        for (const source of sources) {
            const enemies = source.pos.findInRange(FIND_HOSTILE_CREEPS, 1)
            for (const enemy of enemies) {
                if (enemy.getActiveBodyparts(WORK) > 0) {
                    return enemy.owner.username
                }
            }
        }
        return undefined
    }
}

export { ScoutManager }
