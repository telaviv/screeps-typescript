/* eslint @typescript-eslint/no-explicit-any: "off" */
export { Task, TaskMemory } from './constants'

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
