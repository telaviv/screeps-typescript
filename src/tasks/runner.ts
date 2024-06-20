import * as Logger from 'utils/logger'
import { ResourceCreep, Runner, Task } from 'tasks/types'
import MiningRunner from 'tasks/mining'
import PickupRunner from 'tasks/pickup'
import SignRunner from 'tasks/sign'
import TransferRunner from 'tasks/transfer'
import WithdrawRunner from 'tasks/withdraw'
import { wrap } from 'utils/profiling'

const runners: Runner<any>[] = [
    TransferRunner,
    WithdrawRunner,
    PickupRunner,
    MiningRunner,
    SignRunner,
]

export const run = wrap((task: Task<any>, creep: ResourceCreep): boolean => {
    if (task === undefined) {
        throw new Error(`undefined task: ${creep.name}`)
    }

    if (!creep.memory.tasks) {
        throw new Error(`This creep has no tasks: ${creep.name}`)
    }

    for (const runner of runners) {
        if (runner.verifyType(task)) {
            return runner.run(task, creep)
        }
    }
    throw new Error(`TaskRunner type not found ${JSON.stringify(task)}`)
}, 'TaskRunner:run')

export function isResourceCreep(creep: Creep): creep is ResourceCreep {
    return (
        Object.prototype.hasOwnProperty.call(creep.memory, 'tasks') &&
        Object.prototype.hasOwnProperty.call(creep.memory, 'idleTimestamp')
    )
}

export const cleanup = wrap(() => {
    for (const creep of Object.values(Game.creeps)) {
        if (isResourceCreep(creep)) {
            cleanupCreepTask(creep)
        }
    }
}, 'TaskRunner:cleanup')

function cleanupCreepTask(creep: ResourceCreep) {
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
            Logger.info('task-runner:cleanup:needs-cleanup', task)
            creepMemory.tasks.shift()
            cleanupCreepTask(creep)
            return
        }
    }
}
