import { LogisticsCreep } from 'roles/logistics-constants'
import { getContainers } from 'utils/room'
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

    const containers = getEligibleContainers(
        creep.room,
        capacity,
        RESOURCE_ENERGY,
    )
    if (containers.length > 0) {
        const structure = creep.pos.findClosestByRange(containers)
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        addWithdrawTask(creep, structure!)
        return true
    }
    return false
}

export function run(task: WithdrawTask, creep: LogisticsCreep): boolean {
    const storeable = getWithdrawable(task)
    const err = creep.withdraw(storeable, task.resourceType, task.amount)
    if (err === ERR_NOT_IN_RANGE) {
        creep.moveTo(storeable, {
            visualizePathStyle: { stroke: '#ffffff' },
            range: 1,
        })
    } else if (err === OK) {
        Logger.info('task:withdraw:complete', creep.name, task.amount)
        completeRequest(creep)
        return true
    } else if (err !== ERR_BUSY) {
        Logger.warning('task:withdraw:run:failed', creep.name, err)
    }
    return false
}

function addWithdrawTask(creep: LogisticsCreep, structure: AnyStoreStructure) {
    const withdrawObject = WithdrawObject.get(structure.id)
    const task = withdrawObject.makeRequest(creep)
    Logger.info('withdraw:create', creep.name, task.withdrawId, task.amount)
    creep.memory.tasks.push(task)
    return task
}

export function completeRequest(creep: LogisticsCreep) {
    if (!creep.memory.tasks || creep.memory.tasks.length === 0) {
        Logger.warning(
            'task:withdraw::complete:failure',
            creep.name,
            creep.memory.tasks,
        )
    }
    const task = creep.memory.tasks[0]
    if (isWithdrawTask(task)) {
        task.complete = true
    } else {
        Logger.warning(
            'task:withdraw:complete:no-transfer',
            creep.name,
            creep.memory.tasks,
        )
    }
}

export function cleanup(task: WithdrawTask, creep: LogisticsCreep): boolean {
    if (Game.getObjectById(task.withdrawId) === null) {
        Logger.warning(
            'task:withdraw:cleanup:failure',
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
            'task:withdraw:cleanup:capacity-failure',
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

function getEligibleContainers(
    room: Room,
    capacity: number,
    resource: ResourceConstant,
): StructureContainer[] {
    const containers = getContainers(room)
    return structuresWithResources(containers, capacity, resource)
}

function structuresWithResources(
    structures: AnyStoreStructure[],
    capacity: number,
    resource: ResourceConstant,
) {
    return structures.filter(structure => {
        const storeable = WithdrawObject.get(structure.id)
        return (
            structure.structureType === STRUCTURE_CONTAINER &&
            storeable.resourcesAvailable(resource) >= capacity
        )
    }) as StructureContainer[]
}

export default {
    verifyType: isWithdrawTask,
    run,
    cleanup,
}
