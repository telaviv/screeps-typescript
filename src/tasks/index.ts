/* eslint @typescript-eslint/no-explicit-any: "off" */
import { Task } from './types'
export { Task, TaskMemory } from './types'

declare global {
    interface CreepMemory {
        tasks: Task<any>[]
    }
}
