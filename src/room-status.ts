import { compressToBase64 as compress, decompressFromBase64 as decompress } from 'lz-string'

import { FlatRoomPosition } from './types'
import { wrap } from 'utils/profiling'

const SCOUT_TTL = 1000
const VERSION = '1.0.2'

interface SimpleStructure {
    structureType: StructureConstant
    pos: FlatRoomPosition
    my: boolean
    owner?: Owner
}

interface SimpleController {
    my: boolean
    owner?: Owner
    isPowerEnabled: boolean
    level: number
    reservation?: ReservationDefinition
    safeMode?: number
    safeModeAvailable: number
    safeModeCooldown?: number
}

interface ScoutStatus {
    timestamp: number
    version: string
    controller?: SimpleController
    structures: SimpleStructure[]
    terrain: string
}

declare global {
    interface RoomMemory {
        scout?: ScoutStatus
    }

    namespace NodeJS {
        interface Global {
            compress: (uncompressed: string) => string
            decompress: (compressed: string) => string
        }
    }
}

global.compress = compress
global.decompress = decompress

export const run = wrap((): void => {
    for (const roomName in Game.rooms) {
        const room = Game.rooms[roomName]
        if (room.memory.scout && room.memory.scout.version !== VERSION) {
            delete room.memory.scout
        }
    }

    const roomToRecord = Object.values(Game.rooms).find(
        (room) =>
            !room.memory.scout ||
            (room.memory.scout && room.memory.scout.timestamp + SCOUT_TTL < Game.time),
    )

    // we only record 1 room per tick to prevent a thundering herd situation
    if (roomToRecord) {
        recordStatus(roomToRecord)
    }
}, 'room-status:scout')

export function recordStatus(room: Room): void {
    if (
        room.memory.scout &&
        room.memory.scout.timestamp + SCOUT_TTL < Game.time &&
        room.memory.scout.version === VERSION
    ) {
        return
    }
    const controllerStatus = room.controller ? getControllerStatus(room.controller) : undefined
    const structureStatus = getStructuresStatus(room)
    room.memory.scout = {
        timestamp: Game.time,
        version: VERSION,
        controller: controllerStatus,
        structures: structureStatus,
        terrain: serializeTerrain(room),
    }
}

function serializeTerrain(room: Room): string {
    const terrain = room.getTerrain()
    const serialized = []
    for (let y = 0; y < 50; y++) {
        for (let x = 0; x < 50; x++) {
            serialized.push(terrain.get(x, y))
        }
    }
    return compress(serialized.join(''))
}

function getControllerStatus(controller: StructureController): SimpleController {
    const {
        my,
        isPowerEnabled,
        level,
        reservation,
        safeMode,
        safeModeAvailable,
        safeModeCooldown,
        owner,
    } = controller

    return {
        my,
        isPowerEnabled,
        level,
        reservation,
        safeMode,
        safeModeAvailable,
        safeModeCooldown,
        owner,
    }
}

function getStructuresStatus(room: Room): SimpleStructure[] {
    const spawns = room.find<StructureSpawn>(FIND_STRUCTURES, {
        filter: (s) => s.structureType === STRUCTURE_SPAWN,
    })
    return spawns.map(getStructureStatus)
}

function getStructureStatus(structure: OwnedStructure): SimpleStructure {
    const { structureType, pos, my, owner } = structure
    return { structureType, pos, my, owner }
}
