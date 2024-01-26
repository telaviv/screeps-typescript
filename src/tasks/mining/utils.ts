import { Task } from 'tasks/types'
import { MiningTask } from './types'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function isMiningTask(task: Task<any>): task is MiningTask {
    return task.type === 'mining'
}
