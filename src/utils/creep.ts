import { getSpawns } from 'utils/room'
import * as Logger from 'utils/logger'

export function freeEnergyCapacity(creep: Creep) {
    return creep.store.getFreeCapacity(RESOURCE_ENERGY)
}

export function currentEnergyHeld(creep: Creep) {
    return creep.store.getUsedCapacity(RESOURCE_ENERGY)
}

export function calculateBodyCost(parts: BodyPartConstant[]): number {
    let sum = 0
    for (const part of parts) {
        sum += BODYPART_COST[part]
    }
    return sum
}

export function moveToRoom(roomName: string, creep: Creep) {
    creep.moveTo(new RoomPosition(25, 25, roomName), {
        range: 23,
        visualizePathStyle: { stroke: '#ffaa00' },
    })
}

export function isAtEdge(creep: Creep) {
    return (
        creep.pos.x === 0 ||
        creep.pos.x === 49 ||
        creep.pos.y === 0 ||
        creep.pos.y === 49
    )
}

export function recycle(creep: Creep) {
    const spawns = getSpawns(creep.room)
    const spawn = creep.pos.findClosestByPath(spawns)
    if (!spawn) {
        Logger.warning('recycle:failed:noSpawns', creep.name, creep.room.name)
        return
    }

    const err = spawn.recycleCreep(creep)
    if (err === ERR_NOT_IN_RANGE) {
        creep.moveTo(spawn, {
            visualizePathStyle: { stroke: '#ffaa00' },
            range: 1,
        })
        creep.say('♻')
    } else if (err !== OK) {
        Logger.warning('recycle:failed', err, creep.name)
    }
}
