import { Task } from 'tasks/types'
import { MineralWithdrawTask } from './types'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function isMineralWithdrawTask(task: Task<any>): task is MineralWithdrawTask {
    return task.type === 'mineral-withdraw'
}
