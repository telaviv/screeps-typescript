/* eslint @typescript-eslint/no-explicit-any: "off" */

import { LogisticsCreep } from 'roles/logistics-constants'

export interface Task<T> {
    readonly id: string
    readonly type: T
    readonly timestamp: number
    complete: boolean
}

export interface TaskMemory {
    [id: string]: Task<any>
}

export interface ResourceCreepMemory extends CreepMemory {
    tasks: Task<any>[]
    idleTimestamp: number | null
}

export interface ResourceCreep extends Creep {
    memory: ResourceCreepMemory
}

export function isResourceCreep(creep: Creep): creep is ResourceCreep {
    return creep.memory.hasOwnProperty('tasks')
}

export interface Runner<T extends Task<any>> {
    verifyType: (task: Task<any>) => task is T
    run: (task: T, creep: ResourceCreep) => boolean
    cleanup: (task: T, creep: ResourceCreep) => boolean
}
