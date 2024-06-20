import { PickupTask } from './types'
import { Task } from 'tasks/types'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function isPickupTask(task: Task<any>): task is PickupTask {
    return task.type === 'pickup'
}
