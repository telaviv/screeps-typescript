import { ResourceCreepMemory } from 'tasks/types'

export const TASK_HAULING = 'hauling'
export const TASK_BUILDING = 'building'
export const TASK_UPGRADING = 'upgrading'
export const TASK_REPAIRING = 'repairing'
export const TASK_WALL_REPAIRS = 'wall-repairs'
export const TASK_BASE_DEFENSE = 'base-defense'
export const TASK_COLLECTING = 'collecting'
export const TASK_STORE = 'store'
export const TASK_MINING = 'mining'
export const TASK_TRAVELING = 'traveling'
export const TASK_DISMANTLING = 'dismantling'
export const TASK_MINERAL_WITHDRAW = 'mineral-withdraw'
export const TASK_MINERAL_DEPOSIT = 'mineral-deposit'
export const NO_TASK = 'no-task'
export const PREFERENCE_WORKER = 'worker'
export const PREFERENCE_BASE_REPAIRER = 'base-repairer'

export type DeliveryTask =
    | typeof TASK_HAULING
    | typeof TASK_BUILDING
    | typeof TASK_UPGRADING
    | typeof TASK_REPAIRING
    | typeof TASK_WALL_REPAIRS
    | typeof TASK_BASE_DEFENSE
    | typeof TASK_STORE
    | typeof TASK_TRAVELING
export type LogisticsTask =
    | typeof NO_TASK
    | DeliveryTask
    | typeof TASK_COLLECTING
    | typeof TASK_DISMANTLING
    | typeof TASK_MINERAL_WITHDRAW
    | typeof TASK_MINERAL_DEPOSIT
export type LogisticsPreference =
    | typeof TASK_HAULING
    | typeof TASK_BUILDING
    | typeof TASK_UPGRADING
    | typeof TASK_REPAIRING
    | typeof TASK_WALL_REPAIRS
    | typeof PREFERENCE_WORKER
    | typeof PREFERENCE_BASE_REPAIRER

export interface LogisticsCreep extends Creep {
    memory: LogisticsMemory
}

export interface LogisticsMemory extends ResourceCreepMemory {
    role: string
    idleTimestamp: number | null
    home: string
    preference: LogisticsPreference
    currentTask: LogisticsTask
    currentTarget: Id<Structure> | undefined
    formerPreference?: LogisticsPreference // Added for base-repairer conversion
    noSuicide?: boolean
    noRepairLimit?: boolean
}

export function isLogisticsCreep(creep: Creep): creep is LogisticsCreep {
    return (creep as LogisticsCreep).memory.role === 'logistics'
}

export const MINIMUM_EXTENSION_ENERGY = 1750
