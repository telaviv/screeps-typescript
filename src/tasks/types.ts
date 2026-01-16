/** Base interface for all task types */
export interface Task<T> {
    readonly id: string
    readonly type: T
    readonly timestamp: number
    complete: boolean
}

export interface TaskMemory {
    [id: string]: Task<any>
}

/** Creep memory with task queue support */
export interface ResourceCreepMemory extends CreepMemory {
    tasks: Task<unknown>[]
    /** Tick when creep became idle, null if busy */
    idleTimestamp: number | null
}

/** Creep that can have tasks assigned to it */
export interface ResourceCreep extends Creep {
    memory: ResourceCreepMemory
}

export function isResourceCreep(creep: Creep): creep is ResourceCreep {
    return Object.prototype.hasOwnProperty.call(creep.memory, 'tasks')
}

/**
 * Task runner interface. Each task type implements this.
 * - verifyType: Type guard for this task type
 * - run: Executes task logic, returns true if complete
 * - cleanup: Checks if task should be removed (target gone, etc.)
 */
export interface Runner<T extends Task<any>> {
    verifyType: (task: Task<any>) => task is T
    run: (task: T, creep: ResourceCreep) => boolean
    cleanup: (task: T, creep: ResourceCreep) => boolean
}
