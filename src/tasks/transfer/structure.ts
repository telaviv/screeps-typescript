import { TransferTask } from 'tasks/transfer/types'
import { isTransferTask } from 'tasks/transfer/utils'
import { LogisticsCreep } from 'roles/logistics-constants'
import { getAllTasks } from 'tasks/utils'
import autoIncrement from 'utils/autoincrement'
import { currentEnergyHeld } from 'utils/creep'

export class TransferStructure {
    readonly structure: AnyStoreStructure
    readonly tasks: TransferTask[]

    constructor(structure: AnyStoreStructure, tasks: TransferTask[]) {
        this.structure = structure
        this.tasks = tasks
    }

    static create(id: Id<AnyStoreStructure>) {
        const tasks: TransferTask[] = []
        const structure = Game.getObjectById<AnyStoreStructure>(id)
        if (structure === null) {
            throw new Error(`structure id ${id} doesn't exist`)
        }

        for (const task of getAllTasks()) {
            if (isTransferTask(task) && task.structureId === id) {
                tasks.push(task)
            }
        }
        return new TransferStructure(structure, tasks)
    }

    static get(id: Id<AnyStoreStructure>) {
        return TransferStructure.create(id)
    }

    remainingCapacity(resource: ResourceConstant = RESOURCE_ENERGY): number {
        return (
            this.structure.store.getFreeCapacity(resource) -
            this.sumOfTransfers(resource)
        )
    }

    makeRequest(
        creep: LogisticsCreep,
        resource: ResourceConstant = RESOURCE_ENERGY,
    ): TransferTask {
        const creepEnergyAvailable = currentEnergyHeld(creep)
        if (creepEnergyAvailable <= 0) {
            throw new Error(`creep ${creep.name} was trying to make request`)
        }
        const structureCapacity = this.remainingCapacity(resource)
        const amountToTransfer = Math.min(
            creepEnergyAvailable,
            structureCapacity,
        )
        const task = {
            type: 'transfer' as 'transfer',
            id: autoIncrement().toString(),
            creep: creep.name,
            structureId: this.structure.id,
            amount: amountToTransfer,
            timestamp: Game.time,
            resourceType: resource,
            complete: false,
        }
        this.tasks.push(task)
        return task
    }

    private sumOfTransfers(resource: ResourceConstant): number {
        return this.tasks
            .filter(task => task.resourceType === resource)
            .reduce((acc, val) => acc + val.amount, 0)
    }
}
