import * as Logger from 'utils/logger'
import { ResourceCreep, Runner, Task } from 'tasks/types'
import MineralWithdrawRunner from 'tasks/mineral-withdraw'
import MiningRunner from 'tasks/mining'
import PickupRunner from 'tasks/pickup'
import SignRunner from 'tasks/sign'
import TransferRunner from 'tasks/transfer'
import TravelRunner from 'tasks/travel'
import WithdrawRunner from 'tasks/withdraw'
import { wrap } from 'utils/profiling'

/** All task runners in priority order */
const runners: Runner<any>[] = [
    TransferRunner,
    WithdrawRunner,
    MineralWithdrawRunner,
    PickupRunner,
    MiningRunner,
    SignRunner,
    TravelRunner,
]

/** Dispatches a task to the appropriate runner based on type */
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

/** Removes completed/invalid tasks from all creeps */
export const cleanup = wrap(() => {
    for (const creep of Object.values(Game.creeps)) {
        if (isResourceCreep(creep)) {
            cleanupCreepTask(creep)
        }
    }
}, 'TaskRunner:cleanup')

/** Recursively removes completed tasks from a creep's queue */
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
