import { LogisticsCreep } from 'roles/logistics-constants'
import { getFreeCapacity, getUsedCapacity } from 'utils/store'
import * as Logger from 'utils/logger'

import { WithdrawObject } from './object'
import { WithdrawTask, Withdrawable } from './types'
import { isWithdrawTask } from './utils'

export function makeRequest(creep: LogisticsCreep): boolean {
    const capacity = creep.store.getFreeCapacity()
    if (capacity <= 0) {
        return false
    }

    const currentRequest = getCurrentWithdrawRequest(creep)
    if (currentRequest !== null) {
        return true
    }

    const storages = getEligibleStorage(creep.room, capacity)
    if (storages.length > 0) {
        const storage = creep.pos.findClosestByRange(storages)
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        addWithdrawTask(creep, storage!)
        return true
    }
    return false
}

export function run(task: WithdrawTask, creep: LogisticsCreep): boolean {
    const storeable = getWithdrawable(task)
    const creepCapacity = getFreeCapacity(creep, task.resourceType)
    const amount = Math.min(task.amount, creepCapacity)
    const err = creep.withdraw(storeable, task.resourceType, amount)
    if (err === ERR_NOT_IN_RANGE) {
        creep.moveTo(storeable, {
            visualizePathStyle: { stroke: '#ffffff' },
            range: 1,
        })
    } else if (err === OK) {
        Logger.info('withdraw:complete', creep.name, task.amount)
        completeRequest(creep)
        return true
    } else if (err !== ERR_BUSY) {
        Logger.warning('withdraw:run:failed', creep.name, err)
    }
    return false
}

function addWithdrawTask(creep: LogisticsCreep, withdrawable: Withdrawable) {
    const withdrawObject = WithdrawObject.get(withdrawable.id)
    const task = withdrawObject.makeRequest(creep)
    Logger.info(
        'withdraw:create',
        creep.name,
        task.id,
        task.withdrawId,
        task.amount,
    )
    creep.memory.tasks.push(task)
    return task
}

export function completeRequest(creep: LogisticsCreep) {
    if (!creep.memory.tasks || creep.memory.tasks.length === 0) {
        Logger.warning(
            'withdraw::complete:failure',
            creep.name,
            creep.memory.tasks,
        )
    }
    const task = creep.memory.tasks[0]
    if (isWithdrawTask(task)) {
        task.complete = true
    } else {
        Logger.warning(
            'withdraw:complete:no-transfer',
            creep.name,
            creep.memory.tasks,
        )
    }
}

export function cleanup(task: WithdrawTask, creep: LogisticsCreep): boolean {
    if (Game.getObjectById(task.withdrawId) === null) {
        Logger.warning(
            'withdraw:cleanup:failure',
            task.withdrawId,
            creep.name,
            task,
        )
        return true
    }

    const withdrawable = getWithdrawable(task)
    const withdrawCapacity = getUsedCapacity(withdrawable, task.resourceType)
    const creepCapacity = getFreeCapacity(creep, task.resourceType)
    const ret = withdrawCapacity === 0 || creepCapacity === 0
    if (ret && withdrawable instanceof Structure) {
        Logger.warning(
            'withdraw:cleanup:capacity-failure',
            withdrawCapacity,
            creepCapacity,
            creep.name,
            task.amount,
        )
    }
    return ret
}

function getCurrentWithdrawRequest(creep: Creep): WithdrawTask | null {
    if (creep.memory.tasks.length === 0) {
        return null
    }

    const currentTask = creep.memory.tasks[0]
    if (isWithdrawTask(currentTask)) {
        return currentTask
    }

    return null
}

function getWithdrawable(task: WithdrawTask): Withdrawable {
    return Game.getObjectById(task.withdrawId) as Withdrawable
}

function getEligibleStorage(room: Room, capacity: number): Withdrawable[] {
    const withdrawObjects = WithdrawObject.getStorageInRoom(room)
    const eligibles = withdrawObjects.filter(
        target => target.resourcesAvailable(RESOURCE_ENERGY) >= capacity,
    )
    return eligibles.map(eligible => eligible.withdrawable)
}

export default {
    verifyType: isWithdrawTask,
    run,
    cleanup,
}
