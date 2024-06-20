import { MiningTask } from './types'
import { Task } from 'tasks/types'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function isMiningTask(task: Task<any>): task is MiningTask {
    return task.type === 'mining'
}
