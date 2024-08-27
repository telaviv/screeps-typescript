import { ResourceCreepMemory } from 'tasks/types'

export const TASK_HAULING = 'hauling'
export const TASK_BUILDING = 'building'
export const TASK_UPGRADING = 'upgrading'
export const TASK_REPAIRING = 'repairing'
export const TASK_WALL_REPAIRS = 'wall-repairs'
export const TASK_COLLECTING = 'collecting'
export const TASK_STORE = 'store'
export const TASK_MINING = 'mining'
export const TASK_TRAVELING = 'traveling'
export const NO_TASK = 'no-task'
export const PREFERENCE_WORKER = 'worker'

export type DeliveryTask =
    | typeof TASK_HAULING
    | typeof TASK_BUILDING
    | typeof TASK_UPGRADING
    | typeof TASK_REPAIRING
    | typeof TASK_WALL_REPAIRS
    | typeof TASK_STORE
    | typeof TASK_TRAVELING
export type LogisticsTask = typeof NO_TASK | DeliveryTask | typeof TASK_COLLECTING
export type LogisticsPreference =
    | typeof TASK_HAULING
    | typeof TASK_BUILDING
    | typeof TASK_UPGRADING
    | typeof TASK_REPAIRING
    | typeof TASK_WALL_REPAIRS
    | typeof PREFERENCE_WORKER

export interface LogisticsCreep extends Creep {
    memory: LogisticsMemory
}

export interface LogisticsMemory extends ResourceCreepMemory {
    role: string
    idleTimestamp: number | null
    preference: LogisticsPreference
    currentTask: LogisticsTask
    currentTarget: Id<Structure> | undefined
    noSuicide?: boolean
    home: string
}

export function isLogisticsCreep(creep: Creep): creep is LogisticsCreep {
    return (creep as LogisticsCreep).memory.role === 'logistics'
}

export const MINIMUM_EXTENSION_ENERGY = 1750
