import { Task } from 'tasks/types'
import { WithdrawTask } from './types'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function isWithdrawTask(task: Task<any>): task is WithdrawTask {
    return task.type === 'withdraw'
}
