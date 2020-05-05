/* eslint @typescript-eslint/no-explicit-any: "off" */

import { LogisticsCreep } from 'roles/logistics-constants'
import { Task, Runner } from 'tasks/types'
import TransferRunner from 'tasks/transfer'
import * as Logger from 'utils/logger'

const runners: Runner<any>[] = [TransferRunner]

export function run(task: Task<any>, creep: LogisticsCreep): boolean {
    for (const runner of runners) {
        if (runner.verifyType(task)) {
            return runner.run(task, creep)
        }
    }
    throw new Error(`TaskRunner type not found ${JSON.stringify(task)}`)
}

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
    if (task.complete) {
        creepMemory.tasks.shift()
        cleanupCreepTask(creepMemory)
        return
    }

    for (const runner of runners) {
        if (runner.verifyType(task) && runner.cleanup(task)) {
            Logger.warning('task-runner:cleanup:needs-cleanup', task)
            creepMemory.tasks.shift()
            cleanupCreepTask(creepMemory)
            return
        }
    }
}
