import { getSpawns } from 'utils/room'
import * as Logger from 'utils/logger'
import { filter } from 'lodash'
import { LogisticsCreep, LogisticsPreference, isLogisticsCreep } from 'roles/logistics-constants'
import { Harvester, HarvesterCreep } from 'roles/harvester'
import { ResourceCreep, isResourceCreep } from '../tasks/types'

import { wrap } from './profiling'
import { time } from 'console'

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

type MoveToReturnCode =
    | CreepMoveReturnCode
    | ERR_NOT_FOUND
    | ERR_INVALID_ARGS
    | ERR_NO_PATH
    | ERR_INVALID_TARGET

export const moveTo = wrap(
    (pos: RoomPosition, creep: Creep, opts: MoveToOpts = {}): MoveToReturnCode => {
        const original = pos
        const err: MoveToReturnCode = creep.moveTo(pos, {
            ...opts,
            visualizePathStyle: { stroke: '#ffaa00' },
        })
        if (err === ERR_NO_PATH) {
            Logger.warning('moveTo:noPath', creep.name, original, pos)
            const path = PathFinder.search(original, pos, {
                maxRooms: 6,
                swampCost: 1,
            }).path
            return creep.moveByPath(path)
        }
        return err
    },
    'creep:moveTo',
)

export function moveToRoom(roomName: string, creep: Creep) {
    creep.moveTo(new RoomPosition(25, 25, roomName), {
        range: 18,
        visualizePathStyle: { stroke: '#ffaa00' },
    })
}

export function moveTowardsCenter(creep: Creep) {
    creep.moveTo(new RoomPosition(25, 25, creep.room.name), {
        range: 21,
        visualizePathStyle: { stroke: '#ffaa00' },
    })
}

export function isAtEdge(creep: Creep) {
    return creep.pos.x === 0 || creep.pos.x === 49 || creep.pos.y === 0 || creep.pos.y === 49
}

export function recycle(creep: ResourceCreep) {
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

export function getCreeps(role: string, room: Room): Creep[] {
    return Object.values(Game.creeps).filter((creep: Creep) => {
        return (
            creep.memory.role === role &&
            ((creep.memory.home && creep.memory.home === room.name) ||
                creep.room.name === room.name)
        )
    })
}

export function getHarvesters(room: Room): Harvester[] {
    return Object.values(Game.creeps).filter((creep: Creep) => {
        return (
            creep.memory.role === 'harvester' &&
            ((creep.memory.home && creep.memory.home === room.name) ||
                creep.room.name === room.name)
        )
    }) as Harvester[]
}

const harvesterCache: { [time: number]: Harvester[] } = {}
export const getAllHarvesters = wrap((): Harvester[] => {
    if (harvesterCache[Game.time]) {
        return harvesterCache[Game.time]
    }
    const harvesters = Object.values(Game.creeps).filter((creep: Creep) => {
        return creep.memory.role === 'harvester'
    }) as Harvester[]

    harvesterCache[Game.time] = harvesters
    return harvesters
}, 'creep:getAllHarvesters')

export function getLogisticsCreeps(options: {
    room: Room
    preference?: LogisticsPreference
    taskType?: string
}): LogisticsCreep[] {
    const check = (creep: LogisticsCreep): boolean => {
        if (options.preference && creep.memory.preference !== options.preference) {
            return false
        }
        if (options.taskType) {
            if (!creep.memory.tasks.some((task) => task.type === options.taskType)) {
                return false
            }
        }
        return creep.memory.home === options.room.name
    }
    return Object.values(Game.creeps).filter(isLogisticsCreep).filter(check)
}
