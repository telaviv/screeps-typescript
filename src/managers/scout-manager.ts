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

const SCOUT_VERSION = '1.1.0'

const MAX_SCOUT_DISTANCE = MAX_CLAIM_DISTANCE + ENEMY_DISTANCE_BUFFER
const TIME_PER_TICK = 4.7 // seconds on shard 0
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

export const EXPIRATION_TTL = !Game.cpu.generatePixel
    ? (60 * 60 * 48) / 0.2
    : (60 * 60 * 48) / TIME_PER_TICK

export interface ScoutMemory {
    version: string
    updatedAt: number
    controllerOwner?: string
    controllerProgress?: number
    hasInvaderCore?: boolean
    enemyThatsMining?: string
    sourceCount?: number
    controllerBlocked?: boolean
    wallTerrain?: number
    sourcePositions?: Record<Id<Source>, Position>
    controllerPosition?: Position
    mineralPosition?: Position
    safeMode?: number
}

declare global {
    interface RoomMemory {
        scout?: ScoutMemory
    }

    namespace NodeJS {
        interface Global {
            scout: {
                next: () => void
                location: () => void
                now: (destination: string, start: string) => void
            }
        }
    }
}

global.scout = {
    next: () => {
        const scoutManager = ScoutManager.create()
        const room = scoutManager.findNextRoomToScout()
        console.log(`next room to scout: ${room}`)
    },
    location: () => {
        const creep = Object.values(Game.creeps).find((c) => c.memory.role === 'scout')
        if (creep) {
            console.log(`scout location: ${creep.pos}`)
        } else {
            console.log('no scout currently')
        }
    },
    now: (destination: string, start: string): void => {
        new RoomManager(Game.rooms[start]).addScoutRoomTask(destination)
    },
}

class ScoutManager {
    private world: World
    private ownedRoomProgress: OwnedRoomProgress
    private featureRoomData: Record<string, ConstructionFeaturesV3>
    private gameTime: number

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

    get ownedRooms(): string[] {
        return Array.from(this.ownedRoomProgress.keys())
    }

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
            Logger.error('scout-manager:run:no-scout-room:', roomToScout)
            return
        }
        Logger.warning('scout-manager:run:scout-room:', scoutRoom, roomToScout)
        new RoomManager(Game.rooms[scoutRoom]).addScoutRoomTask(roomToScout)
    }

    @profile
    findNextRoomToScout(): string | null {
        const closestRooms = this.world.getClosestRooms(this.ownedRooms, MAX_SCOUT_DISTANCE)
        for (const { roomName } of closestRooms) {
            if (getRoomType(roomName) !== RoomType.ROOM) {
                continue
            }
            if (
                getRoomType(roomName) === RoomType.ROOM &&
                (!this.featureRoomData[roomName] || !this.hasValidScoutData(roomName))
            ) {
                return roomName
            }
        }
        return null
    }

    @profile
    findBestRoomToCreateScout(roomName: string): string | null {
        return this.world.findBestOwnedRoom(roomName, MAX_SCOUT_DISTANCE, this.ownedRoomProgress, {
            filter: (name) => !hasNoSpawns(Game.rooms[name]),
        })
    }

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

    @profile
    clearExpiredScoutData(): void {
        for (const name of Object.keys(Memory.rooms)) {
            if (!this.hasValidScoutData(name)) {
                delete Memory.rooms[name]
            }
        }
    }

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

    private static hasInvaderCore(room: Room): boolean {
        const invaderCores = room.find(FIND_STRUCTURES, {
            filter: { structureType: STRUCTURE_INVADER_CORE },
        })
        return invaderCores ? invaderCores.length > 0 : false
    }

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
