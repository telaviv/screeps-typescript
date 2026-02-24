import * as PickupTask from 'tasks/pickup'
import * as TaskRunner from 'tasks/runner'
import * as TransferTask from 'tasks/transfer'
import * as WithdrawTask from 'tasks/withdraw'
import { ResourceCreep, ResourceCreepMemory } from 'tasks/types'
import {
    getNonVirtualContainers,
    getVirtualControllerLink,
    getVirtualStorage,
} from '../utils/virtual-storage'
import { profile, wrap } from 'utils/profiling'
import { LogisticsCreep } from './logistics-constants'
import { fromBodyPlan } from 'utils/parts'
import { getLinks } from 'utils/room'
import { moveWithinRoom } from 'utils/travel'

const ROLE = 'rebalancer'

export interface Rebalancer extends ResourceCreep {
    memory: RebalancerMemory
    storageTransfered: boolean
}

interface RebalancerMemory extends ResourceCreepMemory {
    role: 'rebalancer'
    home: string
}

export function isRebalancer(creep: Creep): creep is Rebalancer {
    return (creep as LogisticsCreep).memory.role === ROLE
}

export class RebalancerCreep {
    readonly creep: Rebalancer

    constructor(creep: Rebalancer) {
        this.creep = creep
    }

    get memory(): RebalancerMemory {
        return this.creep.memory
    }

    @profile
    run(): void {
        if (this.creep.spawning) {
            return
        }
        if (getLinks(this.creep.room).length === 3) {
            this.creep.suicide()
        }

        if (this.creep.memory.tasks.length > 0) {
            const task = this.creep.memory.tasks[0]
            if (task.type === 'pickup' || task.type === 'withdraw') {
                this.creep.say('🟰⚡')
            } else {
                this.creep.say('🟰🟰')
            }
            TaskRunner.run(task, this.creep)
            return
        } else if (this.creep.store.getUsedCapacity() < 50) {
            this.collectEnergy()
        } else {
            this.rebalance()
        }
        if (this.creep.memory.tasks.length > 0) {
            const task = this.creep.memory.tasks[0]
            TaskRunner.run(task, this.creep)
            return
        } else if (this.creep.store.getUsedCapacity() >= 50) {
            this.collectEnergy()
        } else {
            this.moveToIdlePosition()
        }
    }

    @profile
    collectEnergy(): void {
        if ((this.creep.ticksToLive ?? Infinity) < 50) {
            this.creep.suicide()
        }
        this.creep.say('🟰⚡')

        // Phase 1: Try to collect from non-storage sources (pickup or containers)
        let success = PickupTask.makeRequest(this.creep)
        if (success) {
            return
        }

        success = WithdrawTask.makeRequest(this.creep, {
            excludeVirtualStorage: true,
            sortBy: 'amount',
        })
        if (success) {
            return
        }

        // Phase 2: No non-storage sources available, check if there are transfer tasks that need filling
        // If so, withdraw from storage to service those tasks
        const hasTransferTasks = this.hasAvailableTransferTasks()
        if (hasTransferTasks) {
            success = WithdrawTask.makeRequest(this.creep, {
                sortBy: 'amount',
            })
            if (success) {
                return
            }
        }

        // Nothing to do
        this.rebalance()
    }

    @profile
    hasAvailableTransferTasks(): boolean {
        // Check if there are structures that need energy (excluding virtual storage)
        const extensions = this.creep.room
            .find(FIND_MY_STRUCTURES)
            .filter(
                (s) =>
                    (s.structureType === STRUCTURE_EXTENSION ||
                        s.structureType === STRUCTURE_SPAWN ||
                        s.structureType === STRUCTURE_TOWER) &&
                    s.store &&
                    s.store.getFreeCapacity(RESOURCE_ENERGY) > 0,
            )

        if (extensions.length > 0) {
            return true
        }

        // Check virtual controller link container
        const virtualControllerLink = getVirtualControllerLink(this.creep.memory.home)
        if (
            virtualControllerLink &&
            virtualControllerLink.structureType === STRUCTURE_CONTAINER &&
            virtualControllerLink.store.getFreeCapacity(RESOURCE_ENERGY) > 0
        ) {
            return true
        }

        return false
    }

    @profile
    rebalance(): void {
        this.creep.say('🟰🟰')

        // Phase 1 behavior: deposit to storage
        const virtualStorage = getVirtualStorage(this.creep.memory.home)
        if (virtualStorage) {
            const structure = TransferTask.makeRequest(this.creep, { structure: virtualStorage })
            if (structure) {
                return
            }
        }

        // Phase 2 behavior: deposit to other structures that need energy
        const virtualControllerLink = getVirtualControllerLink(this.creep.memory.home)
        if (virtualControllerLink && virtualControllerLink.structureType === STRUCTURE_CONTAINER) {
            const structure = TransferTask.makeRequest(this.creep, {
                structure: virtualControllerLink,
            })
            if (structure) {
                return
            }
        }
        TransferTask.makeRequest(this.creep)
    }

    @profile
    moveToIdlePosition(): void {
        const containers = getNonVirtualContainers(this.creep.room)
        if (containers.length === 0) {
            return
        }
        containers.sort(
            (a, b) =>
                b.store.getUsedCapacity(RESOURCE_ENERGY) - a.store.getUsedCapacity(RESOURCE_ENERGY),
        )
        const container = containers[0]
        if (this.creep.pos.inRangeTo(container, 2)) {
            return
        }
        moveWithinRoom(this.creep, { pos: containers[0].pos, range: 2 }, { reusePath: 20 })
    }
}

const roleRebalancer = {
    run: wrap((creep: Rebalancer) => {
        const rebalancer = new RebalancerCreep(creep)
        rebalancer.run()
    }, 'roleRebalancer:run'),

    create(spawn: StructureSpawn, capacity?: number): number {
        if (!capacity) {
            capacity = spawn.room.energyAvailable
        }
        const name = `${ROLE}:${spawn.room.name}:${Game.time}`
        return spawn.spawnCreep(fromBodyPlan(capacity, [CARRY, MOVE], { maxCopies: 12 }), name, {
            memory: {
                role: ROLE,
                home: spawn.room.name,
                tasks: [],
                idleTimestamp: null,
            } as RebalancerMemory,
        })
    },
}

export default roleRebalancer
