import includes from 'lodash/includes'

import { WithdrawTask, Withdrawable } from './types'
import autoIncrement from 'utils/autoincrement'
import { getAllTasks } from 'tasks/utils'
import { getConstructionFeatures } from 'construction-features'
import { getUsedCapacity } from 'utils/store'
import { isWithdrawTask } from './utils'

export class WithdrawObject {
    public readonly withdrawable: Withdrawable
    public readonly tasks: WithdrawTask[]

    public constructor(withdrawable: Withdrawable, tasks: WithdrawTask[]) {
        this.withdrawable = withdrawable
        this.tasks = tasks
    }

    public static create(id: Id<Withdrawable>): WithdrawObject {
        const tasks: WithdrawTask[] = []
        const withdrawable = Game.getObjectById<Withdrawable>(id)
        if (withdrawable === null) {
            throw new Error(`withdrawable id ${id} doesn't exist`)
        }

        for (const task of getAllTasks()) {
            if (isWithdrawTask(task) && task.withdrawId === id) {
                tasks.push(task)
            }
        }
        return new WithdrawObject(withdrawable, tasks)
    }

    public static get(id: Id<Withdrawable>): WithdrawObject {
        return WithdrawObject.create(id)
    }

    public static getTargetsInRoom(
        room: Room,
        opts?: { excludeVirtualStorage?: boolean },
    ): WithdrawObject[] {
        const structures = room.find<StructureContainer | StructureStorage>(FIND_STRUCTURES, {
            filter: (r) => {
                if (!includes([STRUCTURE_CONTAINER, STRUCTURE_STORAGE], r.structureType)) {
                    return false
                }
                if (opts?.excludeVirtualStorage) {
                    const features = getConstructionFeatures(room)
                    if (features) {
                        const storagePos = features[STRUCTURE_STORAGE]
                        if (storagePos) {
                            if (r.pos.x === storagePos[0].x && r.pos.y === storagePos[0].y) {
                                return false
                            }
                        }
                    }
                }
                return true
            },
        })
        const tombstones = room.find(FIND_TOMBSTONES)
        const ruins = room.find(FIND_RUINS)

        const structureTargets = structures.map((s) => WithdrawObject.get(s.id))
        const tombstoneTargets = tombstones.map((t) => WithdrawObject.get(t.id))
        const ruinTargets = ruins.map((t) => WithdrawObject.get(t.id))
        return structureTargets.concat(tombstoneTargets, ruinTargets)
    }

    public resourcesAvailable(resource: ResourceConstant = RESOURCE_ENERGY): number {
        return Math.max(
            getUsedCapacity(this.withdrawable, resource) - this.sumOfWithdraws(resource),
            0,
        )
    }

    public makeRequest(creep: Creep, resource: ResourceConstant = RESOURCE_ENERGY): WithdrawTask {
        const creepCapacity = creep.store.getFreeCapacity(resource)
        if (creepCapacity <= 0) {
            throw new Error(
                `creep ${creep.name} was trying to make request: ${JSON.stringify(creep)}`,
            )
        }
        const resourcesAvailable = this.resourcesAvailable(resource)
        const amountToWithdraw = Math.min(creepCapacity, resourcesAvailable)
        const task = {
            type: 'withdraw' as const,
            id: autoIncrement().toString(),
            creep: creep.name,
            withdrawId: this.withdrawable.id,
            amount: amountToWithdraw,
            timestamp: Game.time,
            resourceType: resource,
            complete: false,
        }
        this.tasks.push(task)
        return task
    }

    private sumOfWithdraws(resource: ResourceConstant): number {
        return this.tasks
            .filter((task) => task.resourceType === resource)
            .reduce((acc, val) => acc + val.amount, 0)
    }
}
