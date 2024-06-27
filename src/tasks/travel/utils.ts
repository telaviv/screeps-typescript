import { Task } from 'tasks/types'
import { TravelTask } from './types'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function isTravelTask(task: Task<any>): task is TravelTask {
    return task.type === 'travel'
}
