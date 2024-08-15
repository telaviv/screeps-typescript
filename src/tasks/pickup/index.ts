import * as Logger from 'utils/logger'
import * as TimeCache from 'utils/time-cache'
import { PickupTarget } from './target'
import { PickupTask } from './types'
import { ResourceCreep } from '../types'
import { findClosestByRange } from 'utils/room-position'
import { getFreeCapacity } from 'utils/store'
import { isPickupTask } from './utils'
import { moveTo } from 'utils/travel'
import { wrap } from 'utils/profiling'

const KEY = 'pickup-total-resources'
export const makeRequest = wrap((creep: ResourceCreep): boolean => {
    const capacity = creep.store.getFreeCapacity()
    if (capacity <= 0) {
        return false
    }

    const currentRequest = getCurrentPickupRequest(creep)
    if (currentRequest !== null) {
        return true
    }
    if (!creep.memory.home) {
        Logger.error('task:pickup::makeRequest:failure:no-home', creep.name)
        return false
    }

    const home = Game.rooms[creep.memory.home]
    if (!home) {
        Logger.error('task:pickup::makeRequest:failure:no-room', creep.name, creep.memory.home)
        return false
    }
    let resources = getDroppedResources(home, capacity, RESOURCE_ENERGY)
    if (creep.memory.home !== creep.room.name) {
        resources = resources.concat(getDroppedResources(creep.room, capacity, RESOURCE_ENERGY))
    }
    if (resources.length > 0) {
        const resource = findClosestByRange(creep.pos, resources) as Resource
        if (resource) {
            addPickupTask(creep, resource)
            return true
        } else {
            Logger.error('task:pickup::makeRequest:failure:no-resource', creep.name, resources)
            return false
        }
    }
    return false
}, 'pickup:makeRequest')

export function run(task: PickupTask, creep: ResourceCreep): boolean {
    const resource = getResource(task)
    const err = creep.pickup(resource)
    if (err === ERR_NOT_IN_RANGE) {
        moveTo(creep, { pos: resource.pos, range: 1 })
    } else if (err === OK) {
        Logger.info('task:pickup:complete', creep.name, task.amount)
        completeRequest(creep)
        return true
    } else if (err !== ERR_BUSY) {
        Logger.warning('task:pickup:run:failed', creep.name, task, err)
    }
    return false
}

export function addPickupTask(creep: ResourceCreep, resource: Resource): PickupTask | null {
    const pickupTarget = PickupTarget.get(resource.id)
    if (pickupTarget.resourcesAvailable() < 50) {
        return null
    }
    const task = pickupTarget.makeRequest(creep)
    if (task === null) {
        return null
    }
    Logger.info('pickup:create', creep.name, task.resourceId, task.amount)
    creep.memory.tasks.push(task)
    TimeCache.clearRecord(`${KEY}:${resource.room?.name ?? 'no-room'}`)
    return task
}

export function completeRequest(creep: ResourceCreep): void {
    if (!creep.memory.tasks || creep.memory.tasks.length === 0) {
        Logger.warning('task:pickup::complete:failure', creep.name, creep.memory.tasks)
    }
    const task = creep.memory.tasks[0]
    task.complete = true
}

export function cleanup(task: PickupTask, creep: ResourceCreep): boolean {
    if (Game.getObjectById(task.resourceId) === null) {
        Logger.info('task:pickup:cleanup:non-existant', task.resourceId, creep.name, task)
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

function getDroppedResources(room: Room, capacity: number, resource: ResourceConstant): Resource[] {
    const targets = PickupTarget.findInRoom(room, resource)
    const eligibles = targets.filter((target) => {
        const available = target.resourcesAvailable()
        return available >= capacity && available > 50
    })
    return eligibles.map((eligible) => eligible.resource)
}

export function getTotalDroppedResources(room: Room): number {
    return TimeCache.get(`${KEY}:${room.name}`, () => {
        return PickupTarget.findInRoom(room, RESOURCE_ENERGY).reduce(
            (acc, target) => acc + target.resourcesAvailable(),
            0,
        )
    })
}

export default {
    verifyType: isPickupTask,
    run,
    cleanup,
}
