/* eslint-disable @typescript-eslint/brace-style */

import minBy from 'lodash/minBy'
import includes from 'lodash/includes'
import filter from 'lodash/filter'
import * as Logger from 'utils/logger'
import { randomElement } from 'utils/utilities'

export const EXTENSION_COUNTS = [0, 0, 5, 10, 20, 30, 40, 50, 60]
export const TOWER_COUNTS = [0, 0, 0, 1, 1, 2, 2, 3, 6]
export const SPAWN_COUNTS = [1, 1, 1, 1, 1, 1, 1, 2, 3]
export const LINK_COUNTS = [0, 0, 0, 0, 0, 2, 3, 4, 6]
export const MIN_STORAGE_LEVEL = 4
export const MIN_RAMPART_LEVEL = 2

const STRONG_WALL_HITS = 10000000
const FRAGILE_WALL_HITS = [1, 1, 1000, 10000, 30000, 100000, 100000, 100000, 1000000]

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

export function getExtensions(room: Room): StructureExtension[] {
    return room.find(FIND_MY_STRUCTURES, {
        filter: { structureType: STRUCTURE_EXTENSION },
    })
}

export function getTowers(room: Room): StructureTower[] {
    return room.find(FIND_MY_STRUCTURES, {
        filter: { structureType: STRUCTURE_TOWER },
    })
}

export function getSpawns(room: Room): StructureSpawn[] {
    return room.find(FIND_MY_STRUCTURES, {
        filter: { structureType: STRUCTURE_SPAWN },
    })
}

export function getContainers(room: Room): StructureContainer[] {
    return room.find(FIND_STRUCTURES, {
        filter: { structureType: STRUCTURE_CONTAINER },
    })
}

export function getSources(room: Room): Source[] {
    return room.find(FIND_SOURCES)
}

export function getMinerals(room: Room): Mineral[] {
    return room.find(FIND_MINERALS)
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

export function hasHostileCreeps(room: Room): boolean {
    return room.find(FIND_HOSTILE_CREEPS).length > 0
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

export function getNukers(room: Room): StructureNuker[] {
    return room.find(FIND_MY_STRUCTURES, {
        filter: { structureType: STRUCTURE_NUKER },
    })
}

export function getPowerSpawns(room: Room): StructurePowerSpawn[] {
    return room.find(FIND_MY_STRUCTURES, {
        filter: { structureType: STRUCTURE_POWER_SPAWN },
    })
}

export function getFactories(room: Room): StructureFactory[] {
    return room.find(FIND_MY_STRUCTURES, {
        filter: { structureType: STRUCTURE_FACTORY },
    })
}

export function getTerminals(room: Room): StructureTerminal[] {
    return room.find(FIND_MY_STRUCTURES, {
        filter: { structureType: STRUCTURE_TERMINAL },
    })
}

export function getExtractors(room: Room): StructureExtractor[] {
    return room.find(FIND_MY_STRUCTURES, {
        filter: { structureType: STRUCTURE_EXTRACTOR },
    })
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
        filter: isFragileWall,
    })
    return walls.length > 0
}

export function hasFragileWall(room: Room): boolean {
    const walls = room.find(FIND_STRUCTURES, {
        filter: isFragileWall,
    })
    return walls.length > 0
}

export function hasWeakWall(room: Room): boolean {
    const walls = room.find(FIND_STRUCTURES, {
        filter: isWeakWall,
    })
    return walls.length > 0
}

export function getOwnWeakestWall(
    room: Room,
): StructureWall | StructureRampart | null {
    const walls = room.find<StructureWall | StructureRampart>(
        FIND_MY_STRUCTURES,
        {
            filter: isWeakWall,
        },
    )
    if (walls.length === 0) {
        return null
    }
    return minBy(walls, 'hits')!
}

export function getWeakestWall(
    room: Room,
): StructureWall | StructureRampart | null {
    const walls = room.find<StructureWall | StructureRampart>(FIND_STRUCTURES, {
        filter: isWeakWall,
    })
    if (walls.length === 0) {
        return null
    }
    return minBy(walls, 'hits')!
}

function isFragileWall(structure: Structure): boolean {
    return (
        includes(
            [STRUCTURE_RAMPART, STRUCTURE_WALL],
            structure.structureType,
        ) && structure.hits < FRAGILE_WALL_HITS[structure.room.controller!.level]
    )
}

function isWeakWall(structure: Structure): boolean {
    const isWall = includes(
        [STRUCTURE_RAMPART, STRUCTURE_WALL],
        structure.structureType,
    )

    if (!isWall) {
        return false
    }

    return structure.hits < Math.min(structure.hitsMax, STRONG_WALL_HITS)
}

export function getConstructionSites(
    room: Room,
    opts?: FilterOptions<FIND_CONSTRUCTION_SITES>,
): ConstructionSite[] {
    return room.find(FIND_CONSTRUCTION_SITES, opts)
}

export function getWallSites(
    room: Room,
): ConstructionSite<STRUCTURE_RAMPART | STRUCTURE_WALL>[] {
    return getConstructionSites(room, {
        filter: (site) =>
            site.structureType === STRUCTURE_WALL ||
            site.structureType === STRUCTURE_RAMPART,
    }) as ConstructionSite<STRUCTURE_WALL | STRUCTURE_RAMPART>[]
}

export function hasWallSite(room: Room): boolean {
    return hasConstructionSite(room, {
        filter: (site) =>
            site.structureType === STRUCTURE_WALL ||
            site.structureType === STRUCTURE_RAMPART,
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

export function hasContainerAtPosition(room: Room, pos: RoomPosition): boolean {
    return getContainerAtPosition(room, pos) !== null
}

export function getContainerAtPosition(
    room: Room,
    pos: RoomPosition,
): StructureContainer | null {
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

export function makeConstructionSite(
    pos: RoomPosition,
    type: BuildableStructureConstant,
): ScreepsReturnCode {
    const room = Game.rooms[pos.roomName]
    if (!room.controller || !room.controller.my) {
        return ERR_NOT_OWNER
    }
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

export function makeSpawnConstructionSite(pos: RoomPosition, name?: string) {
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

function findSpawnlessRooms() {
    return Object.values(Game.rooms).filter((room) => {
        if (!(room.controller && room.controller.my)) {
            return false
        }

        const spawns = room.find(FIND_MY_SPAWNS)
        return spawns.length === 0
    })
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
