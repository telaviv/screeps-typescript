import { PickupTask } from './types'
import autoIncrement from 'utils/autoincrement'
import { getAllTasks } from 'tasks/utils'
import { isPickupTask } from './utils'

export class PickupTarget {
    public readonly resource: Resource
    public readonly tasks: PickupTask[]

    public constructor(resource: Resource, tasks: PickupTask[]) {
        this.resource = resource
        this.tasks = tasks
    }

    public static create(id: Id<Resource>): PickupTarget {
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

    public static get(id: Id<Resource>): PickupTarget {
        return PickupTarget.create(id)
    }

    public static findInRoom(room: Room, resource: ResourceConstant): PickupTarget[] {
        const resources = room.find(FIND_DROPPED_RESOURCES, {
            filter: (r) => r.resourceType === resource,
        })
        return resources.map((r) => PickupTarget.get(r.id))
    }

    public resourcesAvailable(): number {
        return Math.max(this.resource.amount - this.sumOfPickups(), 0)
    }

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
