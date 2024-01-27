import maxBy from 'lodash/maxBy'

import { getFreeCapacity, getUsedCapacity } from 'utils/store'
import * as Logger from 'utils/logger'

import { WithdrawObject } from './object'
import { WithdrawTask, Withdrawable } from './types'
import { isWithdrawTask } from './utils'
import { ResourceCreep } from '../types'

export function makeRequest(creep: ResourceCreep): boolean {
    const capacity = creep.store.getFreeCapacity()
    if (capacity <= 0) {
        return false
    }

    const currentRequest = getCurrentWithdrawRequest(creep)
    if (currentRequest !== null) {
        return true
    }

    const withdrawTargets = getEligibleTargets(creep.room, capacity)
    if (withdrawTargets.length > 0) {
        const target = creep.pos.findClosestByRange(withdrawTargets)
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        addWithdrawTask(creep, target!)
        return true
    }
    return false
}

export function run(task: WithdrawTask, creep: ResourceCreep): boolean {
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

function addWithdrawTask(creep: ResourceCreep, withdrawable: Withdrawable) {
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

export function completeRequest(creep: ResourceCreep) {
    if (!creep.memory.tasks || creep.memory.tasks.length === 0) {
        Logger.warning(
            'withdraw::complete:failure',
            creep.name,
            creep.memory.tasks,
        )
    }
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
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

export function cleanup(task: WithdrawTask, creep: Creep): boolean {
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

function getCurrentWithdrawRequest(creep: ResourceCreep): WithdrawTask | null {
    if (creep.memory.tasks.length === 0) {
        return null
    }

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const currentTask = creep.memory.tasks[0]
    if (isWithdrawTask(currentTask)) {
        return currentTask
    }

    return null
}

function getWithdrawable(task: WithdrawTask): Withdrawable {
    return Game.getObjectById(task.withdrawId) as Withdrawable
}

function getEligibleTargets(room: Room, capacity: number): Withdrawable[] {
    const withdrawObjects = WithdrawObject.getTargetsInRoom(room)
    const nonEmpties = withdrawObjects.filter(
        (target) => target.resourcesAvailable(RESOURCE_ENERGY) >= 50,
    )

    const eligibles = nonEmpties.filter(
        (target) => target.resourcesAvailable(RESOURCE_ENERGY) >= capacity,
    )
    if (eligibles.length > 0) {
        return eligibles.map((eligible) => eligible.withdrawable)
    }

    if (nonEmpties.length === 0) {
        return []
    }
    const bestTarget = maxBy(nonEmpties, (t) =>
        t.resourcesAvailable(RESOURCE_ENERGY),
    )
    return [bestTarget!.withdrawable]
}

export default {
    verifyType: isWithdrawTask,
    run,
    cleanup,
}
