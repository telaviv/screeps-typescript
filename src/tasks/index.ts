/* eslint @typescript-eslint/no-explicit-any: "off" */

export interface Task<T> {
    readonly id: string
    readonly type: T
    readonly timestamp: number
    complete: boolean
}

export interface TransferTask extends Task<'transfer'> {
    type: 'transfer'
    structureId: Id<AnyStoreStructure>
    amount: number
    resourceType: ResourceConstant
}

export function isTransferTask(task: Task<any>): task is TransferTask {
    return task.type === 'transfer'
}

export type TaskMemory = { [id: string]: Task<any> }

export function* getAllTasks() {
    for (const creepMemory of Object.values(Memory.creeps)) {
        if (creepMemory.tasks) {
            for (const task of creepMemory.tasks) {
                yield task
            }
        }
    }
}

declare global {
    interface CreepMemory {
        tasks: Task<any>[]
    }
}
