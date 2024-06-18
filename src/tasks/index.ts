/* eslint @typescript-eslint/no-explicit-any: "off" */
import { Task } from './types'
export { Task, TaskMemory } from './types'

declare global {
    interface CreepMemory {
        tasks: Task<any>[]
    }

    namespace NodeJS {
        interface Global {
            deleteAllTasks: () => void
        }
    }
}

function deleteAllTasks() {
    for (const creep of Object.values(Game.creeps)) {
        creep.memory.tasks = []
    }
}

global.deleteAllTasks = deleteAllTasks
