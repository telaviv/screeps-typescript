/* eslint @typescript-eslint/no-explicit-any: "off" */
export { Task, TaskMemory } from './types'

declare global {
    interface CreepMemory {
        tasks: Task<any>[]
    }
}
