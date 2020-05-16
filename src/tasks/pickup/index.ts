import { LogisticsCreep } from 'roles/logistics-constants'
import { getFreeCapacity } from 'utils/store'
import * as Logger from 'utils/logger'

import { PickupTarget } from './target'
import { PickupTask } from './types'
import { isPickupTask } from './utils'

export function makeRequest(creep: LogisticsCreep): boolean {
    const capacity = creep.store.getFreeCapacity()
    if (capacity <= 0) {
        return false
    }

    const currentRequest = getCurrentPickupRequest(creep)
    if (currentRequest !== null) {
        return true
    }

    const resources = getDroppedResources(creep.room, capacity, RESOURCE_ENERGY)
    if (resources.length > 0) {
        const resource = creep.pos.findClosestByRange(resources)
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        addPickupTask(creep, resource!)
        return true
    }
    return false
}

export function run(task: PickupTask, creep: LogisticsCreep): boolean {
    const resource = getResource(task)
    const err = creep.pickup(resource)
    if (err === ERR_NOT_IN_RANGE) {
        creep.moveTo(resource, {
            visualizePathStyle: { stroke: '#ffffff' },
            range: 1,
        })
    } else if (err === OK) {
        Logger.info('task:pickup:complete', creep.name, task.amount)
        completeRequest(creep)
        return true
    } else if (err !== ERR_BUSY) {
        Logger.warning('task:pickup:run:failed', creep.name, err)
    }
    return false
}

function addPickupTask(creep: LogisticsCreep, resource: Resource) {
    const pickupTarget = PickupTarget.get(resource.id)
    const task = pickupTarget.makeRequest(creep)
    Logger.info('pickup:create', creep.name, task.resourceId, task.amount)
    creep.memory.tasks.push(task)
    return task
}

export function completeRequest(creep: LogisticsCreep) {
    if (!creep.memory.tasks || creep.memory.tasks.length === 0) {
        Logger.warning(
            'task:pickup::complete:failure',
            creep.name,
            creep.memory.tasks,
        )
    }
    const task = creep.memory.tasks[0]
    task.complete = true
}

export function cleanup(task: PickupTask, creep: LogisticsCreep): boolean {
    if (Game.getObjectById(task.resourceId) === null) {
        Logger.info(
            'task:pickup:cleanup:non-existant',
            task.resourceId,
            creep.name,
            task,
        )
        return true
    }

    const resource = getResource(task)
    const pickupCapacity = resource.amount
    const creepCapacity = getFreeCapacity(creep, task.resourceType)
    const ret = pickupCapacity === 0 || creepCapacity === 0
    if (ret) {
        Logger.warning(
            'task:pickup:cleanup:capacity-failure',
            pickupCapacity,
            creepCapacity,
            creep.name,
            task.amount,
        )
    }
    return ret
}

function getCurrentPickupRequest(creep: Creep): PickupTask | null {
    if (creep.memory.tasks.length === 0) {
        return null
    }

    const currentTask = creep.memory.tasks[0]
    if (isPickupTask(currentTask)) {
        return currentTask
    }

    return null
}

function getResource(task: PickupTask): Resource {
    return Game.getObjectById(task.resourceId) as Resource
}

function getDroppedResources(
    room: Room,
    capacity: number,
    resource: ResourceConstant,
): Resource[] {
    const resources = room.find<FIND_DROPPED_RESOURCES>(
        FIND_DROPPED_RESOURCES,
        { filter: r => r.resourceType === resource },
    )
    return availableResources(resources, capacity)
}

function availableResources(resources: Resource[], capacity: number) {
    return resources.filter(resource => {
        const pickupTarget = PickupTarget.get(resource.id)
        return pickupTarget.resourcesAvailable() >= capacity
    })
}

export default {
    verifyType: isPickupTask,
    run,
    cleanup,
}
