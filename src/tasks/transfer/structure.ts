import * as TimeCache from 'utils/time-cache'
import { mprofile, profile } from 'utils/profiling'
import { ResourceCreep } from 'tasks/types'
import { TransferTask } from 'tasks/transfer/types'
import autoIncrement from 'utils/autoincrement'
import { currentEnergyHeld } from 'utils/creep'
import { getAllTasks } from 'tasks/utils'
import { isTransferTask } from 'tasks/transfer/utils'

const CACHE_KEY = 'transfer-structure:remainingCapacity'
export class TransferStructure {
    public readonly structure: AnyStoreStructure
    public readonly tasks: TransferTask[]

    public constructor(structure: AnyStoreStructure, tasks: TransferTask[]) {
        this.structure = structure
        this.tasks = tasks
    }

    @mprofile('TransferStructure:create')
    public static create(id: Id<AnyStoreStructure>): TransferStructure {
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

    @mprofile('TransferStructure:get')
    public static get(id: Id<AnyStoreStructure>): TransferStructure {
        return TransferStructure.create(id)
    }

    @profile
    public remainingCapacity(resource: ResourceConstant = RESOURCE_ENERGY): number {
        return TimeCache.get(`${CACHE_KEY}:${this.structure.id}`, () => {
            if (this.structure.store === null) {
                return 0
            }
            const capacity = this.structure.store.getFreeCapacity(resource) || 0
            return capacity - this.sumOfTransfers(resource)
        })
    }

    public makeRequest(
        creep: ResourceCreep,
        resource: ResourceConstant = RESOURCE_ENERGY,
    ): TransferTask {
        const creepEnergyAvailable = currentEnergyHeld(creep)
        if (creepEnergyAvailable <= 0) {
            throw new Error(`creep ${creep.name} was trying to make request`)
        }
        const structureCapacity = this.remainingCapacity(resource)
        const amountToTransfer = Math.min(creepEnergyAvailable, structureCapacity)
        const task = {
            type: 'transfer' as const,
            id: autoIncrement().toString(),
            creep: creep.name,
            structureId: this.structure.id,
            amount: amountToTransfer,
            timestamp: Game.time,
            resourceType: resource,
            complete: false,
        }
        this.tasks.push(task)
        TimeCache.clearRecord(`${CACHE_KEY}:${this.structure.id}`)
        return task
    }

    @profile
    private sumOfTransfers(resource: ResourceConstant): number {
        return this.tasks
            .filter((task) => task.resourceType === resource)
            .reduce((acc, val) => acc + val.amount, 0)
    }
}
