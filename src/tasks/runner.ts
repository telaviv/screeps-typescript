/* eslint @typescript-eslint/no-explicit-any: "off" */

import { LogisticsCreep } from 'roles/logistics-constants'
import { Task, Runner } from 'tasks/types'
import TransferRunner from 'tasks/transfer'
import WithdrawRunner from 'tasks/withdraw'
import PickupRunner from 'tasks/pickup'
import * as Logger from 'utils/logger'

const runners: Runner<any>[] = [TransferRunner, WithdrawRunner, PickupRunner]

export function run(task: Task<any>, creep: LogisticsCreep): boolean {
    for (const runner of runners) {
        if (runner.verifyType(task)) {
            return runner.run(task, creep)
        }
    }
    throw new Error(`TaskRunner type not found ${JSON.stringify(task)}`)
}

export function cleanup() {
    for (const creep of Object.values(Game.creeps)) {
        cleanupCreepTask(creep)
    }
}

function cleanupCreepTask(creep: Creep) {
    const creepMemory = creep.memory
    if (!creepMemory.tasks || creepMemory.tasks.length === 0) {
        return
    }
    const task = creepMemory.tasks[0]
    if (task.complete) {
        creepMemory.tasks.shift()
        cleanupCreepTask(creep)
        return
    }

    for (const runner of runners) {
        if (runner.verifyType(task) && runner.cleanup(task, creep)) {
            Logger.warning('task-runner:cleanup:needs-cleanup', task)
            creepMemory.tasks.shift()
            cleanupCreepTask(creep)
            return
        }
    }
}
