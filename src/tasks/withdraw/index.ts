import maxBy from 'lodash/maxBy'

import * as Logger from 'utils/logger'
import { WithdrawTask, Withdrawable } from './types'
import { getFreeCapacity, getUsedCapacity } from 'utils/store'
import { ResourceCreep } from '../types'
import { WithdrawObject } from './object'
import { findClosestByRange } from 'utils/room-position'
import { getHome } from 'roles/utils'
import { isWithdrawTask } from './utils'
import { moveTo } from 'utils/travel'
import { wrap } from 'utils/profiling'

const addWithdrawTask = wrap((creep: ResourceCreep, withdrawable: Withdrawable) => {
    const withdrawObject = WithdrawObject.get(withdrawable.id)
    const task = withdrawObject.makeRequest(creep)
    Logger.info('withdraw:create', creep.name, task.id, task.withdrawId, task.amount)
    creep.memory.tasks.push(task)
    return task
}, 'withdraw:addWithdrawTask')

export const makeRequest = wrap((creep: ResourceCreep): boolean => {
    const capacity = creep.store.getFreeCapacity()
    if (capacity <= 0) {
        return false
    }

    const currentRequest = getCurrentWithdrawRequest(creep)
    if (currentRequest !== null) {
        return true
    }

    const home = getHome(creep)
    if (!home) {
        Logger.error('withdraw::makeRequest:failure:no-home', creep.name)
        return false
    }
    let withdrawTargets = getEligibleTargets(home, capacity)
    if (creep.memory.home !== creep.room.name) {
        const remoteTargets = getEligibleTargets(creep.room, capacity)
        withdrawTargets = withdrawTargets.concat(remoteTargets)
    }
    if (withdrawTargets.length > 0) {
        const target = findClosestByRange(creep.pos, withdrawTargets, {
            range: 1,
        }) as Withdrawable
        if (!target) {
            Logger.error('withdraw::makeRequest:failure:no-target', creep.name)
            return false
        }
        addWithdrawTask(creep, target)
        return true
    }
    return false
}, 'withdraw:makeRequest')

export function run(task: WithdrawTask, creep: ResourceCreep): boolean {
    const storeable = getWithdrawable(task)
    const creepCapacity = getFreeCapacity(creep, task.resourceType)
    const amount = Math.min(task.amount, creepCapacity)
    const err = creep.withdraw(storeable, task.resourceType, amount)
    if (err === ERR_NOT_IN_RANGE) {
        moveTo(creep, storeable)
    } else if (err === OK) {
        Logger.info('withdraw:complete', creep.name, task.amount)
        completeRequest(creep)
        return true
    } else if (err !== ERR_BUSY) {
        Logger.warning('withdraw:run:failed', creep.name, err)
    }
    return false
}

export function completeRequest(creep: ResourceCreep): void {
    if (!creep.memory.tasks || creep.memory.tasks.length === 0) {
        Logger.warning('withdraw::complete:failure', creep.name, creep.memory.tasks)
    }
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const task = creep.memory.tasks[0]
    if (isWithdrawTask(task)) {
        task.complete = true
    } else {
        Logger.warning('withdraw:complete:no-transfer', creep.name, creep.memory.tasks)
    }
}

export function cleanup(task: WithdrawTask, creep: Creep): boolean {
    if (Game.getObjectById(task.withdrawId) === null) {
        Logger.info('withdraw:cleanup:failure', task.withdrawId, creep.name, task)
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

function isRuin(obj: any): boolean {
    return (
        Object.prototype.hasOwnProperty.call(obj, 'structure') &&
        Object.prototype.hasOwnProperty.call(obj, 'ticksToDecay')
    )
}

function isTombstone(obj: any): boolean {
    return Object.prototype.hasOwnProperty.call(obj, 'deathTime')
}

function isTemporary(withdrawable: WithdrawObject): boolean {
    const object = Game.getObjectById(withdrawable.withdrawable.id)
    return isRuin(object) || isTombstone(object)
}

const getEligibleTargets = wrap((room: Room, capacity: number): Withdrawable[] => {
    const withdrawObjects = WithdrawObject.getTargetsInRoom(room)
    const nonEmpties = withdrawObjects.filter(
        (target) =>
            target.resourcesAvailable(RESOURCE_ENERGY) >= 50 ||
            (target.resourcesAvailable(RESOURCE_ENERGY) > 0 && isTemporary(target)),
    )

    const temporaries = nonEmpties.filter(isTemporary)

    if (temporaries.length > 0) {
        return temporaries.map((eligible) => eligible.withdrawable)
    }

    const eligibles = nonEmpties.filter(
        (target) => target.resourcesAvailable(RESOURCE_ENERGY) >= capacity,
    )

    if (eligibles.length > 0) {
        return eligibles.map((eligible) => eligible.withdrawable)
    }

    if (nonEmpties.length === 0) {
        return []
    }
    const bestTarget = maxBy(nonEmpties, (t) => t.resourcesAvailable(RESOURCE_ENERGY))
    if (!bestTarget) {
        return []
    }
    return [bestTarget.withdrawable]
}, 'withdraw:getEligibleTargets')

export function getTotalWithdrawableResources(room: Room): number {
    const withdrawObjects = WithdrawObject.getTargetsInRoom(room)
    return withdrawObjects.reduce(
        (acc, target) => acc + target.resourcesAvailable(RESOURCE_ENERGY),
        0,
    )
}

export default {
    verifyType: isWithdrawTask,
    run,
    cleanup,
}
