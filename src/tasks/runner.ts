import { isTransferTask } from 'tasks'
import * as TransferTask from 'tasks/transfer/index'
import * as Logger from 'utils/logger'

export function cleanup() {
    for (const creepMemory of Object.values(Memory.creeps)) {
        cleanupCreepTask(creepMemory)
    }
}

function cleanupCreepTask(creepMemory: CreepMemory) {
    if (!creepMemory.tasks || creepMemory.tasks.length === 0) {
        return
    }
    const task = creepMemory.tasks[0]
    if (isTransferTask(task) && TransferTask.cleanup(task)) {
        Logger.info('task-runner:cleanup:needs-cleanup', task)
        creepMemory.tasks.shift()
        cleanupCreepTask(creepMemory)
    }
}
