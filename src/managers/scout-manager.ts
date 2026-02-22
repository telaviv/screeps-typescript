import semverGte from 'semver/functions/gte'

import * as Logger from 'utils/logger'
import { ConstructionFeaturesV3, getConstructionFeaturesV3 } from 'construction-features'
import { ENEMY_DISTANCE_BUFFER, MAX_CLAIM_DISTANCE } from '../constants'
import { OwnedRoomProgress, World } from 'utils/world'
import {
    findMyRooms,
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
import { SubscriptionEvent } from 'pub-sub/constants'
import { assignMines } from './mine-manager'
import { createTravelTask } from 'tasks/travel'
import { getNeighbors } from 'utils/room-position'
import { getScouts } from 'utils/creep'
import { isTravelTask } from 'tasks/travel/utils'
import { subscribe } from 'pub-sub/pub-sub'

/** Current version of scout data format */
const SCOUT_VERSION = '1.2.0'

/** Maximum distance to scout from owned rooms */
const MAX_SCOUT_DISTANCE = MAX_CLAIM_DISTANCE + ENEMY_DISTANCE_BUFFER
/** Average seconds per tick on shard 0 */
const TIME_PER_TICK = 4.7 // seconds on shard 0
/** How long a path-blocked room stays blacklisted (24 hours in ticks) */
const PATH_BLOCK_TTL = (60 * 60 * 24) / TIME_PER_TICK
/** Time-to-live for scout data by room distance (in ticks) */
export const DistanceTTL: Record<number, number> = {
    1: (60 * 60 * 24) / TIME_PER_TICK,
    2: (60 * 60 * 24) / TIME_PER_TICK,
    3: (60 * 60 * 36) / TIME_PER_TICK,
    4: (60 * 60 * 36) / TIME_PER_TICK,
    5: (60 * 60 * 48) / TIME_PER_TICK,
    6: (60 * 60 * 48) / TIME_PER_TICK,
    7: (60 * 60 * 60) / TIME_PER_TICK,
}

if (Object.keys(DistanceTTL).length < MAX_SCOUT_DISTANCE) {
    throw new Error('DistanceTTL is not fully defined')
}

/** Default expiration TTL for scout data (48 hours in ticks) */
export const EXPIRATION_TTL = !Game.cpu.generatePixel
    ? (60 * 60 * 48) / 0.2
    : (60 * 60 * 48) / TIME_PER_TICK

/** Subscriber ID for the construction feature cache */
const FEATURE_CACHE_SUBSCRIPTION_ID = 'scout-manager-feature-cache'

/**
 * Module-level cache of construction features by room.
 * Null means not yet initialized; rebuilt once on first create() call,
 * then kept up-to-date via CONSTRUCTION_FEATURES_UPDATES subscriptions.
 */
let featureRoomCache: Record<string, ConstructionFeaturesV3> | null = null

/** Memory structure for storing scout data about a room */
/** Memory structure for storing scout data about a room */
export interface ScoutMemory {
    /** Scout data format version */
    version: string
    /** Game tick when data was recorded */
    updatedAt: number
    /** Whether this room has been manually denied */
    manuallyDenied?: boolean
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
    /** Game tick when respawn period expires (from closeTime) */
    respawnRoomUntil?: number
    /** Array of blocked exit directions ("1", "3", "5", "7") */
    respawnBlocks?: string[]
}

declare global {
    interface Memory {
        /** Rooms where pathfinding recently failed, keyed by room name to timestamp */
        pathBlockedRooms?: Record<string, number>
    }

    interface RoomMemory {
        /** Scout data for this room */
        scout?: ScoutMemory
        /** Flag to track if first base scouting is complete */
        firstScoutingComplete?: boolean
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
                /** Manually deny a room from being visited */
                deny: (roomName: string) => void
                /** Remove manual denial from a room */
                removeDenial: (roomName: string) => void
                /** List all manually denied rooms */
                listDenied: () => void
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
    /** Manually deny a room from being visited */
    deny: (roomName: string): void => {
        const roomMemory = Memory.rooms[roomName]
        if (!roomMemory) {
            console.log(`Error: Room ${roomName} not found in memory`)
            return
        }
        if (!roomMemory.scout) {
            roomMemory.scout = {
                version: SCOUT_VERSION,
                updatedAt: Game.time,
            }
        }
        roomMemory.scout.manuallyDenied = true
        World.clearClosestRoomCache()
        console.log(`Room ${roomName} has been denied`)
    },
    /** Remove manual denial from a room */
    removeDenial: (roomName: string): void => {
        const scout = Memory.rooms[roomName]?.scout
        if (scout?.manuallyDenied) {
            delete scout.manuallyDenied
            World.clearClosestRoomCache()
            console.log(`Manual denial removed from ${roomName}`)
        } else {
            console.log(`Room ${roomName} was not manually denied`)
        }
    },
    /** List all manually denied rooms */
    listDenied: (): void => {
        const deniedRooms = Object.keys(Memory.rooms).filter(
            (roomName) => Memory.rooms[roomName]?.scout?.manuallyDenied,
        )
        if (deniedRooms.length === 0) {
            console.log('No rooms are manually denied')
        } else {
            console.log(`Manually denied rooms (${deniedRooms.length}):`)
            deniedRooms.forEach((room) => console.log(`  - ${room}`))
        }
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
        for (const room of findSpawnRooms()) {
            if (room.controller?.my) {
                ownedRoomProgress.set(room.name, room.controller.progressTotal)
            }
        }

        if (!featureRoomCache) {
            featureRoomCache = {}
            for (const [name, memory] of Object.entries(Memory.rooms)) {
                if (!memory.constructionFeaturesV3) continue
                const features = getConstructionFeaturesV3(name)
                if (features) {
                    featureRoomCache[name] = features
                }
            }
        }

        return new ScoutManager(world, ownedRoomProgress, featureRoomCache)
    }

    /**
     * Subscribes to construction feature updates to keep the module-level cache
     * current. Should be called each tick via main's addSubscriptions.
     * Also picks up any rooms that gained features since the last call.
     */
    static addSubscriptions(): void {
        if (!featureRoomCache) return

        for (const [name, memory] of Object.entries(Memory.rooms)) {
            if (!memory.constructionFeaturesV3) continue

            // Pick up rooms that gained features after the cache was initialized
            if (!featureRoomCache[name]) {
                const features = getConstructionFeaturesV3(name)
                if (features) {
                    featureRoomCache[name] = features
                }
            }

            subscribe(
                SubscriptionEvent.CONSTRUCTION_FEATURES_UPDATES,
                name,
                FEATURE_CACHE_SUBSCRIPTION_ID,
                () => {
                    if (!featureRoomCache) return
                    const updated = getConstructionFeaturesV3(name)
                    if (updated) {
                        featureRoomCache[name] = updated
                    } else {
                        delete featureRoomCache[name]
                    }
                },
            )
        }
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

        // Auto-assign mines when first base has all distance-1 rooms scouted
        this.checkFirstBaseScoutingComplete()

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

    /**
     * Checks if we have exactly 1 base and all distance-1 rooms are scouted.
     * If so, auto-assigns mines for the first time.
     */
    @profile
    private checkFirstBaseScoutingComplete(): void {
        const myRooms = findMyRooms()

        // Only trigger when we have exactly 1 owned room
        if (myRooms.length !== 1) {
            return
        }

        // Check if we've already auto-assigned (using a memory flag)
        const baseRoom = myRooms[0]
        if (baseRoom.memory.firstScoutingComplete) {
            return
        }

        // Get all distance-1 rooms
        const distance1Rooms = this.world.getClosestRooms([baseRoom.name], 1)

        // Check if all distance-1 rooms are scouted
        const allScouted = distance1Rooms.every(({ roomName }) => {
            const roomType = getRoomType(roomName)
            if (roomType !== RoomType.ROOM) {
                // Non-room types don't need scouting
                return true
            }
            return this.hasValidScoutData(roomName)
        })

        if (allScouted) {
            Logger.warning(
                'scout-manager:checkFirstBaseScoutingComplete: All distance-1 rooms scouted, auto-assigning mines',
                baseRoom.name,
            )
            assignMines()
            baseRoom.memory.firstScoutingComplete = true
        }
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
            const isManuallyDenied = Memory.rooms[roomName]?.scout?.manuallyDenied ?? false
            const pathBlockedRooms = Memory.pathBlockedRooms
            const blockedAt = pathBlockedRooms?.[roomName]
            const isPathBlocked =
                blockedAt !== undefined && this.gameTime - blockedAt < PATH_BLOCK_TTL

            Logger.debug('scout-manager:checking', roomName, {
                distance,
                roomType,
                hasFeatures,
                hasValidScout,
                isManuallyDenied,
                isPathBlocked,
            })

            if (roomType !== RoomType.ROOM) {
                continue
            }
            // Skip manually denied rooms
            if (isManuallyDenied) {
                continue
            }
            // Skip rooms where pathfinding recently failed
            if (isPathBlocked) {
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
        const pathBlockedRooms = Memory.pathBlockedRooms
        if (pathBlockedRooms) {
            for (const [room, timestamp] of Object.entries(pathBlockedRooms)) {
                if (this.gameTime - timestamp >= PATH_BLOCK_TTL) {
                    delete pathBlockedRooms[room]
                }
            }
        }
    }

    /**
     * Checks if the controller has at least one accessible neighbor position.
     * A position is accessible if it's not a wall, not an obstacle, and not blocked by hostile ramparts.
     * @param room - The room containing the controller
     * @param controllerPos - The position of the controller
     * @returns True if at least one neighbor is accessible for claiming
     */
    private static hasAccessibleControllerNeighbors(
        room: Room,
        controllerPos: RoomPosition,
    ): boolean {
        const neighbors = getNeighbors(controllerPos)
        const terrain = room.getTerrain()

        for (const pos of neighbors) {
            // Check if position is a wall
            if (terrain.get(pos.x, pos.y) === TERRAIN_MASK_WALL) {
                continue
            }

            // Check for obstacle structures (walls, spawns, etc.)
            const structures = pos.lookFor(LOOK_STRUCTURES)
            const hasObstacleStructure = structures.some((s) => {
                // Check standard obstacles
                if (s.structureType === STRUCTURE_WALL) return true
                if (s.structureType === STRUCTURE_SPAWN) return true
                if (s.structureType === STRUCTURE_EXTENSION) return true
                if (s.structureType === STRUCTURE_LINK) return true
                if (s.structureType === STRUCTURE_STORAGE) return true
                if (s.structureType === STRUCTURE_TOWER) return true
                if (s.structureType === STRUCTURE_OBSERVER) return true
                if (s.structureType === STRUCTURE_POWER_SPAWN) return true
                if (s.structureType === STRUCTURE_LAB) return true
                if (s.structureType === STRUCTURE_TERMINAL) return true
                if (s.structureType === STRUCTURE_NUKER) return true
                if (s.structureType === STRUCTURE_FACTORY) return true
                return false
            })

            if (hasObstacleStructure) {
                continue
            }

            // Check for hostile ramparts
            const hasHostileRampart = structures.some(
                (s) => s.structureType === STRUCTURE_RAMPART && !(s as StructureRampart).my,
            )

            if (hasHostileRampart) {
                continue
            }

            // This position is accessible
            return true
        }

        // No accessible positions found
        return false
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
            scoutMemory.controllerBlocked = !ScoutManager.hasAccessibleControllerNeighbors(
                room,
                controller.pos,
            )
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

        // Check if this is a respawn room and detect respawn blocks
        const roomStatus = Game.map.getRoomStatus(room.name)
        if (roomStatus.status === 'respawn') {
            if (roomStatus.timestamp !== undefined) {
                scoutMemory.respawnRoomUntil = roomStatus.timestamp
            }
            const blocks = ScoutManager.detectRespawnBlocks(room)
            if (blocks.length > 0) {
                scoutMemory.respawnBlocks = blocks
            }
        } else {
            // Clear respawn data if room is no longer a respawn room
            scoutMemory.respawnRoomUntil = undefined
            scoutMemory.respawnBlocks = undefined
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

    /**
     * Detects respawn blocks by checking for constructed walls on room edges.
     * Only the game can place walls at x=0, x=49, y=0, y=49.
     * @param room - The room to check
     * @returns Array of blocked exit directions ("1", "3", "5", "7")
     */
    private static detectRespawnBlocks(room: Room): string[] {
        const blocks: string[] = []

        // Check top edge (y=0) for walls -> direction "1" (TOP)
        for (let x = 0; x < 50; x++) {
            const structures = room.lookForAt(LOOK_STRUCTURES, x, 0)
            if (structures.some((s) => s.structureType === STRUCTURE_WALL)) {
                blocks.push('1')
                break
            }
        }

        // Check right edge (x=49) for walls -> direction "3" (RIGHT)
        for (let y = 0; y < 50; y++) {
            const structures = room.lookForAt(LOOK_STRUCTURES, 49, y)
            if (structures.some((s) => s.structureType === STRUCTURE_WALL)) {
                blocks.push('3')
                break
            }
        }

        // Check bottom edge (y=49) for walls -> direction "5" (BOTTOM)
        for (let x = 0; x < 50; x++) {
            const structures = room.lookForAt(LOOK_STRUCTURES, x, 49)
            if (structures.some((s) => s.structureType === STRUCTURE_WALL)) {
                blocks.push('5')
                break
            }
        }

        // Check left edge (x=0) for walls -> direction "7" (LEFT)
        for (let y = 0; y < 50; y++) {
            const structures = room.lookForAt(LOOK_STRUCTURES, 0, y)
            if (structures.some((s) => s.structureType === STRUCTURE_WALL)) {
                blocks.push('7')
                break
            }
        }

        return blocks
    }
}

export { ScoutManager }
