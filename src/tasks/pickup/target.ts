import groupBy from 'lodash/groupBy'

import { PickupTask } from './types'
import autoIncrement from 'utils/autoincrement'
import { getAllTasks } from 'tasks/utils'
import { isPickupTask } from './utils'

const TASK_CACHE: Map<Id<Resource>, PickupTask[]> = new Map()
const OBJECT_CACHE: Map<Id<Resource>, PickupTarget> = new Map()

/**
 * Tracks a dropped resource and all pending pickup tasks targeting it.
 * Prevents over-allocation by tracking claimed amounts.
 */
export class PickupTarget {
    public readonly resource: Resource
    public readonly tasks: PickupTask[]
    private static cacheTime: null | number = null

    public constructor(resource: Resource, tasks: PickupTask[]) {
        this.resource = resource
        this.tasks = tasks
    }

    private static ensureCache(): void {
        if (PickupTarget.cacheTime === Game.time) {
            return
        }

        const pickupTasks = Array.from(getAllTasks()).filter(isPickupTask)
        const groupedTasks = groupBy(pickupTasks, 'resourceId')
        TASK_CACHE.clear()
        OBJECT_CACHE.clear()
        for (const [resourceId, tasks] of Object.entries(groupedTasks)) {
            TASK_CACHE.set(resourceId as Id<Resource>, tasks)
        }
        PickupTarget.cacheTime = Game.time
    }

    /** Creates a PickupTarget by finding all tasks targeting this resource */
    public static create(id: Id<Resource>): PickupTarget {
        PickupTarget.ensureCache()
        const tasks: PickupTask[] = TASK_CACHE.get(id) ?? []
        TASK_CACHE.set(id, tasks)
        const resource = Game.getObjectById<Resource>(id)
        if (resource === null) {
            throw new Error(`resource id ${id} doesn't exist`)
        }
        return new PickupTarget(resource, tasks)
    }

    public static get(id: Id<Resource>): PickupTarget {
        if (OBJECT_CACHE.has(id)) {
            return OBJECT_CACHE.get(id) as PickupTarget
        }
        const obj = PickupTarget.create(id)
        OBJECT_CACHE.set(id, obj)
        return obj
    }

    public static findInRoom(room: Room, resource: ResourceConstant): PickupTarget[] {
        const resources = room.find(FIND_DROPPED_RESOURCES, {
            filter: (r) => r.resourceType === resource,
        })
        return resources.map((r) => PickupTarget.get(r.id))
    }

    /** Returns unclaimed resources (total - sum of pending pickup tasks) */
    public resourcesAvailable(): number {
        return Math.max(this.resource.amount - this.sumOfPickups(), 0)
    }

    /** Creates a pickup task for the minimum of creep capacity and available resources */
    public makeRequest(creep: Creep): PickupTask | null {
        const creepCapacity = creep.store.getFreeCapacity(this.resource.resourceType)
        const resourcesAvailable = this.resourcesAvailable()
        if (creepCapacity <= 0) {
            throw new Error(
                `creep ${creep.name} was trying to make pickup request: ${JSON.stringify(creep)}`,
            )
        }
        if (resourcesAvailable <= 0) {
            return null
        }
        const amountToPickup = Math.min(creepCapacity, resourcesAvailable)
        const task = {
            type: 'pickup' as const,
            id: autoIncrement().toString(),
            creep: creep.name,
            resourceId: this.resource.id,
            amount: amountToPickup,
            timestamp: Game.time,
            resourceType: this.resource.resourceType,
            complete: false,
        }
        this.tasks.push(task)
        return task
    }

    private sumOfPickups(): number {
        return this.tasks.reduce((acc, val) => acc + val.amount, 0)
    }
}
