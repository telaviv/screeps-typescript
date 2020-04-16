/* eslint-disable @typescript-eslint/brace-style */

import minBy from 'lodash/minBy'
import includes from 'lodash/includes'
import filter from 'lodash/filter'
import { fromRoom, updateCache } from 'utils/immutable-room'
import * as Logger from 'utils/logger'

export const EXTENSION_COUNTS = [0, 0, 5, 10, 20, 30, 40, 50, 60]
export const TOWER_COUNTS = [0, 0, 0, 1, 1, 2, 2, 3, 6]

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

export function getWeakestWall(room: Room): Structure | null {
    const walls = room.find<Structure>(FIND_STRUCTURES, {
        filter: isWeakWall,
    })
    if (walls.length === 0) {
        return null
    }
    return minBy(walls, 'hits') as Structure
}

function isWeakWall(structure: Structure): boolean {
    const MAX_WALL_REPAIR = 1000000

    return (
        includes(
            [STRUCTURE_RAMPART, STRUCTURE_WALL],
            structure.structureType,
        ) && structure.hits < Math.min(structure.hitsMax, MAX_WALL_REPAIR)
    )
}

export function getConstructionSites(room: Room): ConstructionSite[] {
    return room.find(FIND_CONSTRUCTION_SITES)
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

export function hasConstructionSite(room: Room): boolean {
    if (room.memory.constructing) {
        return true
    }
    return getConstructionSites(room).length > 0
}

export function makeConstructionSite(
    pos: RoomPosition,
    type: BuildableStructureConstant,
): ScreepsReturnCode {
    const room = Game.rooms[pos.roomName]
    const iroom = fromRoom(room)
    const ret = room.createConstructionSite(pos, type)
    if (ret === OK) {
        updateCache(room, iroom.setConstructionSite(pos.x, pos.y, true))
        room.memory.constructing = true
    } else {
        Logger.warning('construction:failed', type, pos, ret)
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
