export const TASK_HAULING = 'hauling'
export const TASK_BUILDING = 'building'
export const TASK_LONG_DISTANCE_BUILD = 'distant-build'
export const TASK_UPGRADING = 'upgrading'
export const TASK_REPAIRING = 'repairing'
export const TASK_WALL_REPAIRS = 'wall-repairs'
export const TASK_COLLECTING = 'collecting'
export const PREFERENCE_WORKER = 'worker'

export type DeliveryTask =
    | typeof TASK_HAULING
    | typeof TASK_BUILDING
    | typeof TASK_UPGRADING
    | typeof TASK_REPAIRING
    | typeof TASK_WALL_REPAIRS
    | typeof TASK_LONG_DISTANCE_BUILD
type LogisticsTask = DeliveryTask | typeof TASK_COLLECTING
export type LogisticsPreference = DeliveryTask | typeof PREFERENCE_WORKER

export interface LogisticsCreep extends Creep {
    memory: LogisticsMemory
}

export interface LogisticsMemory extends CreepMemory {
    role: 'logistics'
    preference: LogisticsPreference
    currentTask: LogisticsTask
    currentTarget: Id<Structure> | undefined
    home: string
    waitTime: number
}

export function isLogisticsCreep(creep: Creep): creep is LogisticsCreep {
    return (creep as LogisticsCreep).memory.role === 'logistics'
}
