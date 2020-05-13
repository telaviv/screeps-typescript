/* eslint @typescript-eslint/no-explicit-any: "off" */

import { Task } from 'tasks/types'
import { TransferTask } from 'tasks/transfer/types'

export function isTransferTask(task: Task<any>): task is TransferTask {
    return task.type === 'transfer'
}
