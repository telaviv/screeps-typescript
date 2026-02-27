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
        _dlPos?: string // Stuck detection: serialized position from last tick
        _dlWait?: number // Stuck detection: consecutive ticks at the same position
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

const DIRECTION_OFFSETS: Record<DirectionConstant, [number, number]> = {
    [TOP]: [0, -1],
    [TOP_RIGHT]: [1, -1],
    [RIGHT]: [1, 0],
    [BOTTOM_RIGHT]: [1, 1],
    [BOTTOM]: [0, 1],
    [BOTTOM_LEFT]: [-1, 1],
    [LEFT]: [-1, 0],
    [TOP_LEFT]: [-1, -1],
}

const OBSTACLE_STRUCTURE_TYPES = new Set<string>([
    STRUCTURE_WALL,
    STRUCTURE_SPAWN,
    STRUCTURE_EXTENSION,
    STRUCTURE_TOWER,
    STRUCTURE_STORAGE,
    STRUCTURE_TERMINAL,
    STRUCTURE_LAB,
    STRUCTURE_NUKER,
    STRUCTURE_OBSERVER,
    STRUCTURE_POWER_SPAWN,
    STRUCTURE_FACTORY,
    STRUCTURE_LINK,
])

export function wander(creep: Creep): MoveToReturnCode {
    const allDirs: DirectionConstant[] = [
        TOP,
        BOTTOM,
        LEFT,
        RIGHT,
        TOP_LEFT,
        TOP_RIGHT,
        BOTTOM_LEFT,
        BOTTOM_RIGHT,
    ]
    const terrain = creep.room.getTerrain()
    const passable = allDirs.filter((dir) => {
        const [dx, dy] = DIRECTION_OFFSETS[dir]
        const nx = creep.pos.x + dx
        const ny = creep.pos.y + dy
        if (nx < 1 || nx > 48 || ny < 1 || ny > 48) return false
        if (terrain.get(nx, ny) === TERRAIN_MASK_WALL) return false
        const structures = creep.room.lookForAt(LOOK_STRUCTURES, nx, ny)
        return !structures.some((s) => OBSTACLE_STRUCTURE_TYPES.has(s.structureType))
    })
    if (passable.length === 0) return ERR_NO_PATH
    return creep.move(randomElement(passable))
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
