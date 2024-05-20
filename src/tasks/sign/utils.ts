import { Task } from 'tasks/types'
import { SignTask } from './types'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function isSignTask(task: Task<any>): task is SignTask {
    return task.type === 'sign'
}
