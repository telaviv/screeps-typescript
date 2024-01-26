/* eslint @typescript-eslint/no-explicit-any: "off" */

import { ResourceCreep, Runner, Task } from 'tasks/types'
import TransferRunner from 'tasks/transfer'
import WithdrawRunner from 'tasks/withdraw'
import PickupRunner from 'tasks/pickup'
import MiningRunner from 'tasks/mining'
import * as Logger from 'utils/logger'

const runners: Runner<any>[] = [TransferRunner, WithdrawRunner, PickupRunner, MiningRunner]

export function run(task: Task<any>, creep: ResourceCreep): boolean {
    if (!creep.memory.tasks) {
        throw new Error(`This creep has no tasks: ${creep.name}`)
    }

    for (const runner of runners) {
        if (runner.verifyType(task)) {
            return runner.run(task, creep)
        }
    }
    throw new Error(`TaskRunner type not found ${JSON.stringify(task)}`)
}

export function isResourceCreep(creep: Creep): creep is ResourceCreep {
    return creep.memory.hasOwnProperty('tasks') && creep.memory.hasOwnProperty('idleTimestamp')
}

export function cleanup() {
    for (const creep of Object.values(Game.creeps)) {
        if (isResourceCreep(creep)) {
            cleanupCreepTask(creep)
        }
    }
}

function cleanupCreepTask(creep: ResourceCreep) {
    const creepMemory = creep.memory
    if (!creepMemory.tasks || creepMemory.tasks.length === 0) {
        return
    }
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const task = creepMemory.tasks[0]
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
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
