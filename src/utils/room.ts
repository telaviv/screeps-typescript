/* eslint-disable @typescript-eslint/brace-style */

import minBy from 'lodash/minBy'
import includes from 'lodash/includes'
import filter from 'lodash/filter'
import * as Logger from 'utils/logger'
import { randomElement } from 'utils/utilities'

export const EXTENSION_COUNTS = [0, 0, 5, 10, 20, 30, 40, 50, 60]
export const TOWER_COUNTS = [0, 0, 0, 1, 1, 2, 2, 3, 6]
export const SPAWN_COUNTS = [1, 1, 1, 1, 1, 1, 1, 2, 3]

const STRONG_WALL_HITS = 1000000
const FRAGILE_WALL_HITS = 100000

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
    }) as StructureExtension[]
}

export function getTowers(room: Room): StructureTower[] {
    return room.find(FIND_MY_STRUCTURES, {
        filter: { structureType: STRUCTURE_TOWER },
    }) as StructureTower[]
}

export function getSpawns(room: Room): StructureSpawn[] {
    return room.find(FIND_MY_STRUCTURES, {
        filter: { structureType: STRUCTURE_SPAWN },
    }) as StructureSpawn[]
}

export function getContainers(room: Room): StructureContainer[] {
    return room.find(FIND_STRUCTURES, {
        filter: { structureType: STRUCTURE_CONTAINER },
    }) as StructureContainer[]
}

export function getSources(room: Room): Source[] {
    return room.find<FIND_SOURCES>(FIND_SOURCES)
}

export function getActiveSources(room: Room): Source[] {
    return room.find<FIND_SOURCES_ACTIVE>(FIND_SOURCES_ACTIVE)
}

export function hasFragileWall(room: Room): boolean {
    const walls = room.find<Structure>(FIND_STRUCTURES, {
        filter: isFragileWall,
    })
    return walls.length > 0
}

export function getWeakestWall(room: Room): Structure | null {
    const walls = room.find<Structure>(FIND_STRUCTURES, {
        filter: isWeakWall,
    })
    if (walls.length === 0) {
        return null
    }
    return minBy(walls, 'hits') as Structure
}

function isFragileWall(structure: Structure): boolean {
    return (
        includes(
            [STRUCTURE_RAMPART, STRUCTURE_WALL],
            structure.structureType,
        ) && structure.hits < FRAGILE_WALL_HITS
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
        Logger.warning('construction:failed', type, pos, ret)
    }
    return ret
}

export function makeSpawnConstructionSite(pos: RoomPosition, name?: string) {
    const room = Game.rooms[pos.roomName]
    if (!room.controller || !room.controller.my) {
        return ERR_NOT_OWNER
    }
    Logger.debug('spawn:construction', pos, name)
    const ret = room.createConstructionSite(pos.x, pos.y, STRUCTURE_SPAWN, name)
    if (ret !== OK) {
        Logger.warning('construction:failed', pos, STRUCTURE_SPAWN, ret, name)
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
    return Object.values(Game.rooms).filter(room => {
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
