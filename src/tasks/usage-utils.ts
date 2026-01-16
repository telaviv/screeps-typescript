import * as Logger from 'utils/logger'
import * as MiningTask from 'tasks/mining'
import * as PickupTask from 'tasks/pickup'
import * as WithdrawTask from 'tasks/withdraw'
import { ResourceCreep } from './types'
import { wrap } from 'utils/profiling'

interface AddEnergyTaskOpts {
    includeMining?: boolean
}

/**
 * Tries to assign an energy acquisition task (pickup, withdraw, or mine).
 * Attempts each task type in order until one succeeds.
 */
export const addEnergyTask = wrap((creep: ResourceCreep, opts: AddEnergyTaskOpts = {}): boolean => {
    const taskMap = [
        { tasker: PickupTask, name: 'pickup' },
        { tasker: WithdrawTask, name: 'withdraw' },
        { tasker: MiningTask, name: 'mining' },
    ]
    for (const { tasker, name } of taskMap) {
        if (!opts.includeMining && name === 'mining') {
            continue
        }
        const ret = tasker.makeRequest(creep)
        if (ret) {
            if (creep.memory.tasks.length === 0) {
                Logger.error('addEnergyTask:failureToMakeTask', name, creep.name)
                return false
            } else {
                return true
            }
        }
    }
    Logger.debug('addEnergyTask:failure', 'no tasks could be made', creep.name)
    return false
}, 'usage-utils:addEnergyTask')
