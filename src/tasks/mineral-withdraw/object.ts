import { groupBy } from 'lodash'

import { MineralWithdrawTask, MineralWithdrawable } from './types'
import { mprofile, profile } from 'utils/profiling'
import autoIncrement from 'utils/autoincrement'
import { getAllTasks } from 'tasks/utils'
import { getMineralManager } from 'managers/mineral-manager'
import { getUsedCapacity } from 'utils/store'
import { isMineralWithdrawTask } from './utils'

declare global {
    namespace NodeJS {
        interface Global {
            mineralWithdraw: { tasks: (id: Id<MineralWithdrawable>) => void }
        }
    }
}

global.mineralWithdraw = {
    tasks: (id: Id<MineralWithdrawable>) => {
        const container = Game.getObjectById(id)
        if (!container || !container.room) {
            console.log(`Container ${id} not found`)
            return
        }
        const mineralManager = getMineralManager(container.room)
        if (!mineralManager) {
            console.log(`No mineral manager for room ${container.room.name}`)
            return
        }
        const tasks = MineralWithdrawObject.get(id, mineralManager.id).tasks
        for (const task of tasks) {
            console.log(JSON.stringify(task))
        }
    },
}

const TASK_CACHE: Map<Id<MineralWithdrawable>, MineralWithdrawTask[]> = new Map()
const OBJECT_CACHE: Map<Id<MineralWithdrawable>, MineralWithdrawObject> = new Map()

export class MineralWithdrawObject {
    public readonly withdrawable: MineralWithdrawable
    public readonly mineralId: Id<Mineral>
    public readonly tasks: MineralWithdrawTask[]
    private static cacheTime: null | number = null

    public constructor(
        withdrawable: MineralWithdrawable,
        mineralId: Id<Mineral>,
        tasks: MineralWithdrawTask[],
    ) {
        this.withdrawable = withdrawable
        this.mineralId = mineralId
        this.tasks = tasks
    }

    @mprofile('MineralWithdrawObject:ensureCache')
    private static ensureCache() {
        if (MineralWithdrawObject.cacheTime === Game.time) {
            return
        }

        const mineralWithdrawTasks = Array.from(getAllTasks()).filter(isMineralWithdrawTask)
        const groupedTasks = groupBy(mineralWithdrawTasks, 'withdrawId')
        TASK_CACHE.clear()
        OBJECT_CACHE.clear()
        for (const [withdrawId, tasks] of Object.entries(groupedTasks)) {
            TASK_CACHE.set(withdrawId as Id<MineralWithdrawable>, tasks)
        }
        MineralWithdrawObject.cacheTime = Game.time
    }

    @mprofile('MineralWithdrawObject:create')
    public static create(
        id: Id<MineralWithdrawable>,
        mineralId: Id<Mineral>,
    ): MineralWithdrawObject {
        MineralWithdrawObject.ensureCache()
        const tasks: MineralWithdrawTask[] = TASK_CACHE.get(id) ?? []
        TASK_CACHE.set(id, tasks)
        const withdrawable = Game.getObjectById<MineralWithdrawable>(id)
        if (withdrawable === null) {
            throw new Error(`mineral withdrawable id ${id} doesn't exist`)
        }
        return new MineralWithdrawObject(withdrawable, mineralId, tasks)
    }

    @mprofile('MineralWithdrawObject:get')
    public static get(id: Id<MineralWithdrawable>, mineralId: Id<Mineral>): MineralWithdrawObject {
        if (OBJECT_CACHE.has(id)) {
            return OBJECT_CACHE.get(id) as MineralWithdrawObject
        }
        const obj = MineralWithdrawObject.create(id, mineralId)
        OBJECT_CACHE.set(id, obj)
        return obj
    }

    @mprofile('MineralWithdrawObject:getTargetsInRoom')
    public static getTargetsInRoom(room: Room): MineralWithdrawObject[] {
        const mineralManager = getMineralManager(room)
        if (!mineralManager) {
            return []
        }

        const container = mineralManager.container
        if (!container) {
            return []
        }

        // Only return if container has minerals
        const mineralType = mineralManager.mineralType
        if (container.store.getUsedCapacity(mineralType) <= 0) {
            return []
        }

        return [MineralWithdrawObject.get(container.id, mineralManager.id)]
    }

    @profile
    public resourcesAvailable(resource: ResourceConstant): number {
        return Math.max(
            getUsedCapacity(this.withdrawable, resource) - this.sumOfWithdraws(resource),
            0,
        )
    }

    public makeRequest(creep: Creep, resource: ResourceConstant): MineralWithdrawTask | null {
        const creepCapacity = creep.store.getFreeCapacity(resource)
        if (creepCapacity <= 0) {
            throw new Error(
                `creep ${creep.name} was trying to make mineral withdraw request: ${JSON.stringify(
                    creep,
                )}`,
            )
        }
        const resourcesAvailable = this.resourcesAvailable(resource)
        const amountToWithdraw = Math.min(creepCapacity, resourcesAvailable)
        if (amountToWithdraw <= 0) {
            return null
        }
        const task = {
            type: 'mineral-withdraw' as const,
            id: autoIncrement().toString(),
            creep: creep.name,
            withdrawId: this.withdrawable.id,
            mineralId: this.mineralId,
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
