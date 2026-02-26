/* eslint-disable @typescript-eslint/brace-style */

import filter from 'lodash/filter'
import includes from 'lodash/includes'
import minBy from 'lodash/minBy'

import * as Logger from 'utils/logger'
import { isBuildableStructureConstant } from '../constants'
import { isObstacle } from 'types'
import { randomElement } from 'utils/utilities'
import { wrap } from 'utils/profiling'

export const EXTENSION_COUNTS = [0, 0, 5, 10, 20, 30, 40, 50, 60]
export const TOWER_COUNTS = [0, 0, 0, 1, 1, 2, 2, 3, 6]
export const SPAWN_COUNTS = [1, 1, 1, 1, 1, 1, 1, 2, 3]
export const LINK_COUNTS = [0, 0, 0, 0, 0, 2, 3, 4, 6]
export const MIN_STORAGE_LEVEL = 4
export const MIN_RAMPART_LEVEL = 2

/**
 * Calculates the total energy capacity available for spawning at a given RCL.
 * Uses Screeps constants for precise calculation: spawns + extensions.
 * @param rcl - Room Controller Level (1-8)
 * @returns Total energy capacity in the room at that RCL
 */
export function getEnergyCapacityForRCL(rcl: number): number {
    const clampedRcl = Math.max(0, Math.min(8, rcl))
    const extensionCount = CONTROLLER_STRUCTURES[STRUCTURE_EXTENSION][clampedRcl] || 0
    const spawnCount = CONTROLLER_STRUCTURES[STRUCTURE_SPAWN][clampedRcl] || 0

    return (
        extensionCount * EXTENSION_ENERGY_CAPACITY[clampedRcl] + spawnCount * SPAWN_ENERGY_CAPACITY
    )
}

const STRONG_WALL_HITS = 100000000
const FRAGILE_WALL_HITS = [1, 1, 1000, 10000, 15000, 20000, 100000, 100000, 1000000]

export function isAtExtensionCap(room: Room): boolean {
    if (!room.controller) {
        return true
    }
    const extensions = getExtensions(room)
    return extensions.length >= EXTENSION_COUNTS[room.controller.level]
}

export function isAtTowerCap(room: Room): boolean {
    if (!room.controller) {
        return true
    }
    const towers = getTowers(room)
    return towers.length >= TOWER_COUNTS[room.controller.level]
}

export function hasNoSpawns(room: Room): boolean {
    if (!room.controller) {
        return true
    }
    const spawns = getSpawns(room)
    return spawns.length === 0
}

export function isAtSpawnCap(room: Room): boolean {
    if (!room.controller) {
        return true
    }
    const spawns = getSpawns(room)
    return spawns.length >= SPAWN_COUNTS[room.controller.level]
}

export function getSpawnSites(room: Room): ConstructionSite<STRUCTURE_SPAWN>[] {
    return room.find(FIND_MY_CONSTRUCTION_SITES, {
        filter: { structureType: STRUCTURE_SPAWN },
    })
}

export const getExtensions = wrap((room: Room): StructureExtension[] => {
    return room.find(FIND_MY_STRUCTURES, {
        filter: { structureType: STRUCTURE_EXTENSION },
    })
}, 'room:getExtensions')

export const getTowers = wrap((room: Room): StructureTower[] => {
    return room.find(FIND_MY_STRUCTURES, {
        filter: { structureType: STRUCTURE_TOWER },
    })
}, 'room:getTowers')

export const getSpawns = wrap((room: Room): StructureSpawn[] => {
    return room.find(FIND_MY_STRUCTURES, {
        filter: { structureType: STRUCTURE_SPAWN },
    })
}, 'room:getSpawns')

export function getContainers(room: Room): StructureContainer[] {
    return room.find(FIND_STRUCTURES, {
        filter: { structureType: STRUCTURE_CONTAINER },
    })
}

export function getSources(room: Room): Source[] {
    return room.find(FIND_SOURCES)
}

export function getMineral(room: Room): Mineral | null {
    return room.find(FIND_MINERALS)?.[0] ?? null
}

export function getLinks(room: Room): StructureLink[] {
    return room.find(FIND_MY_STRUCTURES, {
        filter: { structureType: STRUCTURE_LINK },
    })
}

export function getWalls(room: Room): StructureWall[] {
    return room.find(FIND_STRUCTURES, {
        filter: { structureType: STRUCTURE_WALL },
    })
}

export function getEnemyCreeps(room: Room): Creep[] {
    return getHostileCreeps(room).filter((creep) => creep.owner.username !== SYSTEM_USERNAME)
}

export function getHostileCreeps(room: Room): Creep[] {
    return room.find(FIND_HOSTILE_CREEPS)
}

export function hasHostileCreeps(room: Room): boolean {
    return getHostileCreeps(room).length > 0
}

export function getInjuredCreeps(room: Room): Creep[] {
    return room.find(FIND_MY_CREEPS).filter((creep: Creep) => creep.hits < creep.hitsMax)
}

export function getRamparts(room: Room): StructureRampart[] {
    return room.find(FIND_STRUCTURES, {
        filter: { structureType: STRUCTURE_RAMPART },
    })
}

export function getRoads(room: Room): StructureRoad[] {
    return room.find(FIND_STRUCTURES, {
        filter: { structureType: STRUCTURE_ROAD },
    })
}

export function hasBuildingAt(pos: RoomPosition, type: StructureConstant): boolean {
    const structures = pos.lookFor(LOOK_STRUCTURES)
    return structures.some((s) => s.structureType === type)
}

export function getLabs(room: Room): StructureLab[] {
    return room.find(FIND_MY_STRUCTURES, {
        filter: { structureType: STRUCTURE_LAB },
    })
}

export function getNuker(room: Room): StructureNuker | null {
    const nukers = room.find(FIND_MY_STRUCTURES, {
        filter: { structureType: STRUCTURE_NUKER },
    })
    return (nukers[0] as StructureNuker) ?? null
}

export function getPowerSpawns(room: Room): StructurePowerSpawn[] {
    return room.find(FIND_MY_STRUCTURES, {
        filter: { structureType: STRUCTURE_POWER_SPAWN },
    })
}

export function getFactory(room: Room): StructureFactory | null {
    const factories = room.find(FIND_MY_STRUCTURES, {
        filter: { structureType: STRUCTURE_FACTORY },
    })
    return (factories[0] as StructureFactory) ?? null
}

export function getTerminal(room: Room): StructureTerminal | null {
    const terminals = room.find(FIND_MY_STRUCTURES, {
        filter: { structureType: STRUCTURE_TERMINAL },
    })
    return (terminals[0] as StructureTerminal) ?? null
}

export function getExtractor(room: Room): StructureExtractor | null {
    const extractors = room.find(FIND_MY_STRUCTURES, {
        filter: { structureType: STRUCTURE_EXTRACTOR },
    })
    return (extractors[0] as StructureExtractor) ?? null
}

export function getInvaderCores(room: Room): StructureInvaderCore[] {
    return room.find(FIND_STRUCTURES, {
        filter: { structureType: STRUCTURE_INVADER_CORE },
    })
}

export function hasStructureAt(
    structureType: StructureConstant,
    room: Room,
    x: number,
    y: number,
): boolean {
    return (
        room
            .lookForAt<LOOK_STRUCTURES>(LOOK_STRUCTURES, x, y)
            .filter((s) => s.structureType === structureType).length > 0
    )
}

export function getActiveSources(room: Room): Source[] {
    return room.find(FIND_SOURCES_ACTIVE)
}

export function getStorage(room: Room): StructureStorage | null {
    const storages = room.find<StructureStorage>(FIND_MY_STRUCTURES, {
        filter: { structureType: STRUCTURE_STORAGE },
    })
    if (storages.length > 0) {
        return storages[0]
    }
    return null
}

export function getStorages(room: Room): StructureStorage[] {
    return room.find<StructureStorage>(FIND_MY_STRUCTURES, {
        filter: { structureType: STRUCTURE_STORAGE },
    })
}

export function hasStorage(room: Room): boolean {
    return getStorage(room) !== null
}

export function hasOwnFragileWall(room: Room): boolean {
    const walls = room.find(FIND_MY_STRUCTURES, {
        filter: (structure) => isFragileWall(structure),
    })
    return walls.length > 0
}

export function hasOwnWalls(room: Room): boolean {
    if (!room.controller?.my) {
        return false
    }
    const walls = room.find(FIND_STRUCTURES, {
        filter: (structure) => {
            if (structure.structureType === STRUCTURE_WALL) {
                return structure.hits < structure.hitsMax
            }
            if (structure.structureType === STRUCTURE_RAMPART) {
                return structure.hits < structure.hitsMax && structure.my
            }
            return false
        },
    })
    return walls.length > 0
}

export function hasFragileWall(room: Room): boolean {
    const walls = room.find(FIND_STRUCTURES, {
        filter: (structure) => isFragileWall(structure),
    })
    return walls.length > 0
}

export function hasWeakWall(room: Room): boolean {
    const walls = room.find(FIND_STRUCTURES, {
        filter: (structure) => isWeakWall(structure),
    })
    return walls.length > 0
}

export function getNearestFragileWall(
    room: Room,
    pos: RoomPosition,
): StructureWall | StructureRampart | null {
    const walls = room.find<StructureWall | StructureRampart>(FIND_MY_STRUCTURES, {
        filter: (structure) => isFragileWall(structure),
    })
    if (walls.length === 0) {
        return null
    }
    return pos.findClosestByRange(walls)
}

export function getOwnWeakestWall(room: Room): StructureWall | StructureRampart | null {
    const walls = room.find<StructureWall | StructureRampart>(FIND_MY_STRUCTURES, {
        filter: (structure) => isWeakWall(structure),
    })
    if (walls.length === 0) {
        return null
    }
    return minBy(walls, 'hits') as StructureWall | StructureRampart
}

export function getWeakestWall(room: Room): StructureWall | StructureRampart | null {
    const walls = room.find<StructureWall | StructureRampart>(FIND_STRUCTURES, {
        filter: (structure) => isWeakWall(structure),
    })
    if (walls.length === 0) {
        return null
    }
    return minBy(walls, 'hits') as StructureWall | StructureRampart
}

/**
 * Checks if a position is at the edge of a room (x=0, x=49, y=0, or y=49).
 * Edge walls in respawn areas are indestructible and should not be repaired.
 */
function isEdgePosition(pos: RoomPosition): boolean {
    return pos.x === 0 || pos.x === 49 || pos.y === 0 || pos.y === 49
}

export function isFragileWall(structure: Structure, percentage = 1): boolean {
    if (!structure.room.controller) {
        Logger.error('isFragileWall: no controller')
        return false
    }

    // Skip edge walls - they're indestructible in respawn areas
    if (isEdgePosition(structure.pos)) {
        return false
    }

    return (
        includes([STRUCTURE_RAMPART, STRUCTURE_WALL], structure.structureType) &&
        structure.hits < FRAGILE_WALL_HITS[structure.room.controller.level] * percentage
    )
}

function isWeakWall(structure: Structure): boolean {
    const isWall = includes([STRUCTURE_RAMPART, STRUCTURE_WALL], structure.structureType)

    if (!isWall) {
        return false
    }

    // Skip edge walls - they're indestructible in respawn areas
    if (isEdgePosition(structure.pos)) {
        return false
    }

    return structure.hits < Math.min(structure.hitsMax, STRONG_WALL_HITS)
}

export const getConstructionSites = wrap(
    (room: Room, opts?: FilterOptions<FIND_CONSTRUCTION_SITES>): ConstructionSite[] => {
        return room.find(FIND_CONSTRUCTION_SITES, opts)
    },
    'room:getConstructionSites',
)

export function getMyConstructionSites(room: Room): ConstructionSite[] {
    return room.find(FIND_MY_CONSTRUCTION_SITES)
}

export function getHostileConstructionSites(room: Room): ConstructionSite[] {
    return room.find(FIND_HOSTILE_CONSTRUCTION_SITES)
}

export function clearConstructionSites(room: Room): void {
    const sites = getConstructionSites(room)
    for (const site of sites) {
        site.remove()
    }
}

export function getWallSites(room: Room): ConstructionSite<STRUCTURE_RAMPART | STRUCTURE_WALL>[] {
    return getConstructionSites(room, {
        filter: (site) =>
            site.structureType === STRUCTURE_WALL || site.structureType === STRUCTURE_RAMPART,
    }) as ConstructionSite<STRUCTURE_WALL | STRUCTURE_RAMPART>[]
}

export function hasWallSite(room: Room): boolean {
    return hasConstructionSite(room, {
        filter: (site) =>
            site.structureType === STRUCTURE_WALL || site.structureType === STRUCTURE_RAMPART,
    })
}

export function hasTunnelSite(room: Room): boolean {
    return hasConstructionSite(room, {
        filter: (site) => {
            if (site.structureType !== STRUCTURE_ROAD) {
                return false
            }

            const terrain = room.getTerrain()
            return terrain.get(site.pos.x, site.pos.y) === TERRAIN_MASK_WALL
        },
    })
}

const WALL_TERRAIN_COUNT_CACHE = new Map<string, number>()
export function getWallTerrainCount(room: Room): number {
    if (WALL_TERRAIN_COUNT_CACHE.has(room.name)) {
        return WALL_TERRAIN_COUNT_CACHE.get(room.name) as number
    }
    const positions = getWallPositions(room.getTerrain(), room.name)
    const count = positions.length
    WALL_TERRAIN_COUNT_CACHE.set(room.name, positions.length)
    return count
}

export function getWallPositions(terrain: RoomTerrain, roomName: string): RoomPosition[] {
    const positions: RoomPosition[] = []
    for (let x = 0; x < 50; x++) {
        for (let y = 0; y < 50; y++) {
            if (
                terrain.get(x, y) === TERRAIN_MASK_WALL ||
                [0, 49].includes(x) ||
                [0, 49].includes(y)
            ) {
                positions.push(new RoomPosition(x, y, roomName))
            }
        }
    }
    return positions
}

export function hasContainerAtPosition(room: Room, pos: RoomPosition): boolean {
    return getContainerAtPosition(room, pos) !== null
}

export function getContainerAtPosition(room: Room, pos: RoomPosition): StructureContainer | null {
    const containers = filter(room.lookForAt(LOOK_STRUCTURES, pos), {
        structureType: STRUCTURE_CONTAINER,
    })
    if (containers.length === 0) {
        return null
    }
    return containers[0] as StructureContainer
}

export function hasConstructionSite(
    room: Room,
    opts?: FilterOptions<FIND_CONSTRUCTION_SITES>,
): boolean {
    return getConstructionSites(room, opts).length > 0
}

export function getBuildableStructures(room: Room): Structure<BuildableStructureConstant>[] {
    return room.find(FIND_STRUCTURES, {
        filter: (structure) => Boolean(isBuildableStructureConstant(structure.structureType)),
    }) as Structure<BuildableStructureConstant>[]
}

export function getBuildableStructuresAt(
    room: Room,
    x: number,
    y: number,
): Structure<BuildableStructureConstant>[] {
    return room.lookForAt<LOOK_STRUCTURES>(LOOK_STRUCTURES, x, y).filter((structure) => {
        return isBuildableStructureConstant(structure.structureType)
    }) as Structure<BuildableStructureConstant>[]
}

export function getObstacles(room: Room): Structure[] {
    return room.find(FIND_STRUCTURES, {
        filter: (structure) => isObstacle(structure.structureType),
    }) as Structure<BuildableStructureConstant>[]
}

export function getObstacleAt(
    room: Room,
    x: number,
    y: number,
): Structure<BuildableStructureConstant> | null {
    const structures = getBuildableStructuresAt(room, x, y)
    if (structures.length === 0) {
        return null
    } else if (isObstacle(structures[0].structureType)) {
        return structures[0]
    }
    return null
}

export function getBuildingAt(
    room: Room,
    type: StructureConstant,
    x: number,
    y: number,
): Structure<StructureConstant> | null {
    const structures = room.lookForAt<LOOK_STRUCTURES>(LOOK_STRUCTURES, x, y)
    for (const structure of structures) {
        if (structure.structureType === type) {
            return structure
        }
    }
    return null
}

export function makeConstructionSite(
    pos: RoomPosition,
    type: BuildableStructureConstant,
): ScreepsReturnCode {
    const room = Game.rooms[pos.roomName]
    const ret = room.createConstructionSite(pos, type)
    if (ret !== OK) {
        logConstructionFailure(pos, type, ret)
    }
    return ret
}

function logConstructionFailure(
    pos: RoomPosition,
    type: BuildableStructureConstant,
    ret: ScreepsReturnCode,
) {
    const room = Game.rooms[pos.roomName]
    Logger.warning(
        'construction:failed',
        type,
        pos,
        ret,
        room.getTerrain().get(pos.x, pos.y),
        room.name,
    )
}

export function makeSpawnConstructionSite(pos: RoomPosition, name?: string): ScreepsReturnCode {
    const room = Game.rooms[pos.roomName]
    if (!room.controller || !room.controller.my) {
        return ERR_NOT_OWNER
    }
    Logger.debug('spawn:construction', pos, name)
    const ret = room.createConstructionSite(pos.x, pos.y, STRUCTURE_SPAWN, name)
    if (ret !== OK) {
        Logger.warning('construction:spawn:failed', pos, STRUCTURE_SPAWN, ret, name)
    }
    return ret
}

export enum RoomType {
    ROOM = 'room',
    HIGHWAY = 'highway',
    CENTER = 'center',
    SOURCE_KEEPER = 'source-keeper',
}

export const getRoomType = (roomName: string): RoomType => {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const [EW, NS] = roomName.match(/\d+/g) as any
    // eslint-disable-next-line @typescript-eslint/no-magic-numbers
    if (EW % 10 === 0 || NS % 10 === 0) {
        return RoomType.HIGHWAY
    } // eslint-disable-next-line @typescript-eslint/no-magic-numbers

    if (EW % 5 === 0 && NS % 5 === 0) {
        return RoomType.CENTER
    }
    // eslint-disable-next-line @typescript-eslint/no-magic-numbers
    if (Math.abs(5 - (EW % 10)) <= 1 && Math.abs(5 - (NS % 10)) <= 1) {
        return RoomType.SOURCE_KEEPER
    }

    return RoomType.ROOM
}

export function findClaimCapableRooms(): Room[] {
    return findSpawnRooms().filter((room) => room.energyCapacityAvailable >= 650)
}

export function findSpawnRooms(): Room[] {
    return Object.values(Game.rooms).filter((room) => {
        if (!(room.controller && room.controller.my)) {
            return false
        }

        const spawns = room.find(FIND_MY_SPAWNS)
        return spawns.length > 0
    })
}

export function findSpawnlessRooms(): Room[] {
    return Object.values(Game.rooms).filter((room) => {
        if (!(room.controller && room.controller.my)) {
            return false
        }

        const spawns = room.find(FIND_MY_SPAWNS)
        return spawns.length === 0
    })
}

export function findMyRooms(): Room[] {
    return Object.values(Game.rooms).filter((room) => room.controller && room.controller.my)
}

export function findLongDistanceBuild(home: string): ConstructionSite | null {
    for (const room of findSpawnlessRooms()) {
        if (room.name !== home) {
            const constructionSites = room.find(FIND_MY_CONSTRUCTION_SITES)
            if (constructionSites.length > 0) {
                return randomElement(constructionSites)
            }
        }
    }
    return null
}

export function needsLongDistanceBuild(home: string): boolean {
    return findLongDistanceBuild(home) !== null
}
