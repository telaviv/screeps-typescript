import includes from 'lodash/includes'

import { LogisticsCreep } from 'roles/logistics-constants'
import { getAllTasks } from 'tasks/utils'
import autoIncrement from 'utils/autoincrement'
import { getUsedCapacity } from 'utils/store'

import { WithdrawTask, Withdrawable } from './types'
import { isWithdrawTask } from './utils'

export class WithdrawObject {
    readonly withdrawable: Withdrawable
    readonly tasks: WithdrawTask[]

    constructor(withdrawable: Withdrawable, tasks: WithdrawTask[]) {
        this.withdrawable = withdrawable
        this.tasks = tasks
    }

    static create(id: Id<Withdrawable>) {
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

    static get(id: Id<Withdrawable>) {
        return WithdrawObject.create(id)
    }

    static getStorageInRoom(room: Room): WithdrawObject[] {
        const structures = room.find<StructureContainer | StructureStorage>(
            FIND_STRUCTURES,
            {
                filter: r =>
                    includes(
                        [STRUCTURE_CONTAINER, STRUCTURE_STORAGE],
                        r.structureType,
                    ),
            },
        )
        return structures.map(structure => WithdrawObject.get(structure.id))
    }

    resourcesAvailable(resource: ResourceConstant = RESOURCE_ENERGY): number {
        return Math.max(
            getUsedCapacity(this.withdrawable, resource) -
                this.sumOfWithdraws(resource),
            0,
        )
    }

    makeRequest(
        creep: LogisticsCreep,
        resource: ResourceConstant = RESOURCE_ENERGY,
    ): WithdrawTask {
        const creepCapacity = creep.store.getFreeCapacity(resource)
        if (creepCapacity <= 0) {
            throw new Error(
                `creep ${
                    creep.name
                } was trying to make request: ${JSON.stringify(creep)}`,
            )
        }
        const resourcesAvailable = this.resourcesAvailable(resource)
        const amountToWithdraw = Math.min(creepCapacity, resourcesAvailable)
        const task = {
            type: 'withdraw' as 'withdraw',
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
            .filter(task => task.resourceType === resource)
            .reduce((acc, val) => acc + val.amount, 0)
    }
}
