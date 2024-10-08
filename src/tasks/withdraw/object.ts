import { includes, groupBy } from 'lodash'

import { WithdrawTask, Withdrawable } from './types'
import { mprofile, profile } from 'utils/profiling'
import autoIncrement from 'utils/autoincrement'
import { getAllTasks } from 'tasks/utils'
import { getConstructionFeatures } from 'construction-features'
import { getUsedCapacity } from 'utils/store'
import { isWithdrawTask } from './utils'

declare global {
    namespace NodeJS {
        interface Global {
            withdraw: { tasks: (id: Id<Withdrawable>) => void }
        }
    }
}

global.withdraw = {
    tasks: (id: Id<Withdrawable>) => {
        const tasks = WithdrawObject.get(id).tasks
        for (const task of tasks) {
            console.log(JSON.stringify(task))
        }
    },
}

const TASK_CACHE: Map<Id<Withdrawable>, WithdrawTask[]> = new Map()
const OBJECT_CACHE: Map<Id<Withdrawable>, WithdrawObject> = new Map()

export class WithdrawObject {
    public readonly withdrawable: Withdrawable
    public readonly tasks: WithdrawTask[]
    private static cacheTime: null | number = null

    public constructor(withdrawable: Withdrawable, tasks: WithdrawTask[]) {
        this.withdrawable = withdrawable
        this.tasks = tasks
    }

    @mprofile('WithdrawObject:ensureCache')
    private static ensureCache() {
        if (WithdrawObject.cacheTime === Game.time) {
            return
        }

        const withdrawTasks = Array.from(getAllTasks()).filter(isWithdrawTask)
        const groupedTasks = groupBy(withdrawTasks, 'withdrawId')
        TASK_CACHE.clear()
        OBJECT_CACHE.clear()
        for (const [withdrawId, tasks] of Object.entries(groupedTasks)) {
            TASK_CACHE.set(withdrawId as Id<Withdrawable>, tasks)
        }
        WithdrawObject.cacheTime = Game.time
    }

    @mprofile('WithdrawObject:create')
    public static create(id: Id<Withdrawable>): WithdrawObject {
        WithdrawObject.ensureCache()
        const tasks: WithdrawTask[] = TASK_CACHE.get(id) ?? []
        TASK_CACHE.set(id, tasks)
        const withdrawable = Game.getObjectById<Withdrawable>(id)
        if (withdrawable === null) {
            throw new Error(`withdrawable id ${id} doesn't exist`)
        }
        return new WithdrawObject(withdrawable, tasks)
    }

    @mprofile('WithdrawObject:get')
    public static get(id: Id<Withdrawable>): WithdrawObject {
        if (OBJECT_CACHE.has(id)) {
            return OBJECT_CACHE.get(id) as WithdrawObject
        }
        const obj = WithdrawObject.create(id)
        OBJECT_CACHE.set(id, obj)
        return obj
    }

    @mprofile('WithdrawObject:getTargetsInRoom')
    public static getTargetsInRoom(
        room: Room,
        opts?: { excludeVirtualStorage?: boolean; excludeContainers?: boolean },
    ): WithdrawObject[] {
        const structures = room.find<StructureContainer | StructureStorage>(FIND_STRUCTURES, {
            filter: (r) => {
                const types: (STRUCTURE_CONTAINER | STRUCTURE_STORAGE)[] = [STRUCTURE_STORAGE]
                if (!opts?.excludeContainers) {
                    types.push(STRUCTURE_CONTAINER)
                }
                if (!includes(types, r.structureType)) {
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

    @profile
    public resourcesAvailable(resource: ResourceConstant = RESOURCE_ENERGY): number {
        return Math.max(
            getUsedCapacity(this.withdrawable, resource) - this.sumOfWithdraws(resource),
            0,
        )
    }

    public makeRequest(
        creep: Creep,
        resource: ResourceConstant = RESOURCE_ENERGY,
    ): WithdrawTask | null {
        const creepCapacity = creep.store.getFreeCapacity(resource)
        if (creepCapacity <= 0) {
            throw new Error(
                `creep ${creep.name} was trying to make withdraw request: ${JSON.stringify(creep)}`,
            )
        }
        const resourcesAvailable = this.resourcesAvailable(resource)
        const amountToWithdraw = Math.min(creepCapacity, resourcesAvailable)
        if (amountToWithdraw <= 0) {
            return null
        }
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
