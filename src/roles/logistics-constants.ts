export const TASK_HAULING = 'hauling'
export const TASK_BUILDING = 'building'
export const TASK_UPGRADING = 'upgrading'
export const TASK_REPAIRING = 'repairing'
export const TASK_COLLECTING = 'collecting'
export const PREFERENCE_WORKER = 'worker'

export type DeliveryTask =
    | typeof TASK_HAULING
    | typeof TASK_BUILDING
    | typeof TASK_UPGRADING
    | typeof TASK_REPAIRING
type Task = DeliveryTask | typeof TASK_COLLECTING
export type LogisticsPreference = DeliveryTask | typeof PREFERENCE_WORKER

export interface Logistics extends SourceCreep {
    memory: LogisticsMemory
}

export interface LogisticsMemory extends SourceMemory {
    role: 'logistics'
    preference: LogisticsPreference
    currentTask: Task
}
