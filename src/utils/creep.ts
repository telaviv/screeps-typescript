import * as Logger from 'utils/logger'
import * as TimeCache from 'utils/time-cache'
import { LogisticsCreep, LogisticsPreference, isLogisticsCreep } from 'roles/logistics-constants'
import { Scout, isScout } from 'roles/scout'
import { moveTo, moveToRoom } from './travel'
import { Harvester } from 'roles/harvester'
import { MatrixCacheManager } from 'matrix-cache'
import { getSpawns } from 'utils/room'
import { isTravelTask } from 'tasks/travel/utils'
import { randomElement } from './utilities'
import { wrap } from './profiling'

declare global {
    namespace NodeJS {
        interface Global {
            creep: {
                getCreeps: (role: string, roomName?: string) => void
            }
        }
    }
}

interface RenewInformation {
    cost: number
    ticks: number
}

export function freeEnergyCapacity(creep: Creep): number {
    return creep.store.getFreeCapacity(RESOURCE_ENERGY)
}

export function currentEnergyHeld(creep: Creep): number {
    return creep.store.getUsedCapacity(RESOURCE_ENERGY)
}

export function calculateBodyCost(parts: BodyPartConstant[]): number {
    let sum = 0
    for (const part of parts) {
        sum += BODYPART_COST[part]
    }
    return sum
}

export type MoveToReturnCode =
    | CreepMoveReturnCode
    | ERR_NOT_FOUND
    | ERR_INVALID_ARGS
    | ERR_NO_PATH
    | ERR_INVALID_TARGET

declare global {
    interface CreepMemory {
        role: string
        home: string | undefined
        _dlPos?: string // Deadlock detection: serialized position from last tick
        _dlWait?: number // Deadlock detection: number of ticks waiting at same position
    }
}

export const moveToStationaryPoint = wrap((pos: RoomPosition, creep: Creep): MoveToReturnCode => {
    const moveCount = creep.getActiveBodyparts(MOVE)
    const totalCount = creep.body.length
    const roadPreferred = moveCount / totalCount < 0.5

    const matrix = MatrixCacheManager.getTravelMatrix(creep.room.name, roadPreferred).clone()
    matrix.set(pos.x, pos.y, 0)
    const callback = (roomName: string): CostMatrix | boolean => {
        if (roomName === pos.roomName) {
            return matrix
        }
        return false
    }
    return moveTo(creep, { pos, range: 0 }, { roomCallback: callback, priority: 10 })
}, 'creep:moveWithinRoom')

export function goHome(creep: Creep): void {
    if (creep.memory.home) {
        moveToRoom(creep, creep.memory.home)
    } else {
        Logger.warning('goHome:noHome', creep.name)
    }
}

export function isAtEdge(creep: Creep): boolean {
    return creep.pos.x === 0 || creep.pos.x === 49 || creep.pos.y === 0 || creep.pos.y === 49
}

export function wander(creep: Creep): MoveToReturnCode {
    const set = new Set([TOP, BOTTOM, LEFT, RIGHT, TOP_LEFT, TOP_RIGHT, BOTTOM_LEFT, BOTTOM_RIGHT])
    if (creep.pos.x === 1) {
        set.delete(LEFT)
        set.delete(TOP_LEFT)
        set.delete(BOTTOM_LEFT)
    } else if (creep.pos.x === 48) {
        set.delete(RIGHT)
        set.delete(TOP_RIGHT)
        set.delete(BOTTOM_RIGHT)
    }
    if (creep.pos.y === 1) {
        set.delete(TOP)
        set.delete(TOP_LEFT)
        set.delete(TOP_RIGHT)
    } else if (creep.pos.y === 48) {
        set.delete(BOTTOM)
        set.delete(BOTTOM_LEFT)
        set.delete(BOTTOM_RIGHT)
    }
    return creep.move(randomElement([...set]))
}

export function recycle(creep: Creep): void {
    const spawns = getSpawns(creep.room)
    const spawn = creep.pos.findClosestByPath(spawns)
    if (!spawn) {
        Logger.warning('recycle:failed:noSpawns', creep.name, creep.room.name)
        return
    }

    const err = spawn.recycleCreep(creep)
    if (err === ERR_NOT_IN_RANGE) {
        moveTo(
            creep,
            { pos: spawn.pos, range: 1 },
            {
                visualizePathStyle: { stroke: '#ffaa00' },
            },
        )
        creep.say('♻')
    } else if (err !== OK) {
        Logger.warning('recycle:failed', err, creep.name)
    }
}

export function getCreeps(role: string, room?: Room): Creep[] {
    return TimeCache.get(`creep:getCreeps:${role}:${room ? room.name : 'all'}`, () => {
        return Object.values(Game.creeps).filter((creep: Creep) => {
            if (!creep.memory.role) {
                return false
            }
            if (room) {
                if (
                    creep.room.name !== room.name &&
                    creep.memory.home &&
                    creep.memory.home !== room.name
                ) {
                    return false
                }
            }
            return creep.memory.role === role
        })
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

export function getScouts(permanent = false): Scout[] {
    const scouts = Object.values(Game.creeps).filter(isScout)
    return scouts.filter((scout) =>
        scout.memory.tasks.every((task) => isTravelTask(task) && task.permanent === permanent),
    )
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

export function getRenewInformation(creep: Creep): RenewInformation {
    const creepCost = calculateBodyCost(creep.body.map((part) => part.type))
    const bodySize = creep.body.length
    const ticks = Math.floor(600 / bodySize)
    const cost = Math.ceil(creepCost / 2.5 / bodySize)
    return { cost, ticks }
}

global.creep = {
    getCreeps: (role: string, roomName?: string): void => {
        const creeps = getCreeps(role, roomName ? Game.rooms[roomName] : undefined)
        for (const creep of creeps) {
            console.log('creep', creep.room.name, creep.name)
        }
    },
}
