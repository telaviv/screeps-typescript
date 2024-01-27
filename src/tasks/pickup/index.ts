import { getFreeCapacity } from 'utils/store'
import * as Logger from 'utils/logger'

import { PickupTarget } from './target'
import { PickupTask } from './types'
import { isPickupTask } from './utils'
import { ResourceCreep } from '../types'

/* eslint @typescript-eslint/no-unsafe-assignment: "off" */
/* eslint @typescript-eslint/no-unsafe-member-access: "off" */

export function makeRequest(creep: ResourceCreep): boolean {
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

export function run(task: PickupTask, creep: ResourceCreep): boolean {
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

function addPickupTask(creep: ResourceCreep, resource: Resource) {
    const pickupTarget = PickupTarget.get(resource.id)
    const task = pickupTarget.makeRequest(creep)
    Logger.info('pickup:create', creep.name, task.resourceId, task.amount)
    creep.memory.tasks.push(task)
    return task
}

export function completeRequest(creep: ResourceCreep) {
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

export function cleanup(task: PickupTask, creep: ResourceCreep): boolean {
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

function getCurrentPickupRequest(creep: ResourceCreep): PickupTask | null {
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
    const targets = PickupTarget.findInRoom(room, resource)
    const eligibles = targets.filter(
        (target) => target.resourcesAvailable() >= capacity,
    )
    return eligibles.map((eligible) => eligible.resource)
}

export default {
    verifyType: isPickupTask,
    run,
    cleanup,
}
