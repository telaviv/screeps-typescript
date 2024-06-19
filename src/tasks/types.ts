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
    tasks: Task<unknown>[]
    idleTimestamp: number | null
}

export interface ResourceCreep extends Creep {
    memory: ResourceCreepMemory
}

export function isResourceCreep(creep: Creep): creep is ResourceCreep {
    return Object.prototype.hasOwnProperty.call(creep.memory, 'tasks')
}

export interface Runner<T extends Task<any>> {
    verifyType: (task: Task<any>) => task is T
    run: (task: T, creep: ResourceCreep) => boolean
    cleanup: (task: T, creep: ResourceCreep) => boolean
}
