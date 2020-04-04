export const TASK_HAULING = 'hauling'
export const TASK_BUILDING = 'building'
export const TASK_UPGRADING = 'upgrading'
export const TASK_REPAIRING = 'repairing'
export const TASK_COLLECTING = 'collecting'

export type DeliveryTask =
    | typeof TASK_HAULING
    | typeof TASK_BUILDING
    | typeof TASK_UPGRADING
    | typeof TASK_REPAIRING
type Task = DeliveryTask | typeof TASK_COLLECTING

export interface Logistics extends SourceCreep {
    memory: LogisticsMemory
}

export interface LogisticsMemory extends SourceMemory {
    role: 'logistics'
    preference: DeliveryTask
    currentTask: Task
}
