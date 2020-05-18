import { LogisticsCreep } from 'roles/logistics-constants'
import { getAllTasks } from 'tasks/utils'
import autoIncrement from 'utils/autoincrement'

import { PickupTask } from './types'
import { isPickupTask } from './utils'

export class PickupTarget {
    readonly resource: Resource
    readonly tasks: PickupTask[]

    constructor(resource: Resource, tasks: PickupTask[]) {
        this.resource = resource
        this.tasks = tasks
    }

    static create(id: Id<Resource>) {
        const tasks: PickupTask[] = []
        const resource = Game.getObjectById<Resource>(id)
        if (resource === null) {
            throw new Error(`resource id ${id} doesn't exist`)
        }

        for (const task of getAllTasks()) {
            if (isPickupTask(task) && task.resourceId === id) {
                tasks.push(task)
            }
        }
        return new PickupTarget(resource, tasks)
    }

    static get(id: Id<Resource>) {
        return PickupTarget.create(id)
    }

    static findInRoom(room: Room, resource: ResourceConstant): PickupTarget[] {
        const resources = room.find<FIND_DROPPED_RESOURCES>(
            FIND_DROPPED_RESOURCES,
            { filter: r => r.resourceType === resource },
        )
        return resources.map(r => PickupTarget.get(r.id))
    }

    resourcesAvailable(): number {
        return Math.max(this.resource.amount - this.sumOfPickups(), 0)
    }

    makeRequest(creep: LogisticsCreep): PickupTask {
        const creepCapacity = creep.store.getFreeCapacity(
            this.resource.resourceType,
        )
        const resourcesAvailable = this.resourcesAvailable()
        if (creepCapacity <= 0) {
            throw new Error(
                `creep ${
                    creep.name
                } was trying to make request: ${JSON.stringify(creep)}`,
            )
        }
        if (resourcesAvailable <= 0) {
            throw new Error(
                `creep ${
                    creep.name
                } was trying to make request: ${JSON.stringify(this.resource)}`,
            )
        }
        const amountToPickup = Math.min(creepCapacity, resourcesAvailable)
        const task = {
            type: 'pickup' as 'pickup',
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
