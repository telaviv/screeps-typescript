import * as PickupTask from 'tasks/pickup'
import * as TaskRunner from 'tasks/runner'
import * as TransferTask from 'tasks/transfer'
import * as WithdrawTask from 'tasks/withdraw'
import { ResourceCreep, ResourceCreepMemory } from 'tasks/types'
import { profile, wrap } from 'utils/profiling'
import { LogisticsCreep } from './logistics-constants'
import { fromBodyPlan } from 'utils/parts'
import { getConstructionFeaturesFromMemory } from 'construction-features'

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

export function getVirtualStorage(roomName: string): StructureStorage | StructureContainer | null {
    const features = getConstructionFeaturesFromMemory(Memory.rooms[roomName])
    if (!features || !features[STRUCTURE_STORAGE] || features[STRUCTURE_STORAGE].length === 0) {
        return null
    }
    const pos = features[STRUCTURE_STORAGE][0]
    const roomPosition = new RoomPosition(pos.x, pos.y, roomName)
    const structures = roomPosition.lookFor(LOOK_STRUCTURES)
    for (const structure of structures) {
        if (structure.structureType === STRUCTURE_STORAGE) {
            return structure as StructureStorage
        } else if (structure.structureType === STRUCTURE_CONTAINER) {
            return structure as StructureContainer
        }
    }
    return null
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
        if (this.creep.memory.tasks.length > 0) {
            const task = this.creep.memory.tasks[0]
            TaskRunner.run(task, this.creep)
            return
        } else if (
            this.creep.store.getUsedCapacity() < Math.min(this.creep.store.getCapacity(), 200)
        ) {
            this.collectEnergy()
        } else {
            this.rebalance()
        }
        if (this.creep.memory.tasks.length > 0) {
            const task = this.creep.memory.tasks[0]
            TaskRunner.run(task, this.creep)
            return
        }
    }

    @profile
    collectEnergy(): void {
        if ((this.creep.ticksToLive ?? Infinity) < 50) {
            this.creep.suicide()
        }
        let success = PickupTask.makeRequest(this.creep)
        if (success) {
            return
        }

        success = WithdrawTask.makeRequest(this.creep, { excludeVirtualStorage: true })
        if (success) {
            return
        }

        success = WithdrawTask.makeRequest(this.creep)
        if (!success) {
            this.rebalance()
            return
        }
    }

    @profile
    rebalance(): void {
        const virtualStorage = getVirtualStorage(this.creep.memory.home)
        if (virtualStorage) {
            const structure = TransferTask.makeRequest(this.creep, { structure: virtualStorage })
            if (structure) {
                return
            }
        }
        TransferTask.makeRequest(this.creep)
    }
}

const roleRebalancer = {
    run: wrap((creep: Rebalancer) => {
        const rebalancer = new RebalancerCreep(creep)
        rebalancer.run()
    }, 'roleRebalancer:run'),

    create(spawn: StructureSpawn): number {
        const name = `${ROLE}:${spawn.room.name}:${Game.time}`
        return spawn.spawnCreep(fromBodyPlan(spawn.room.energyAvailable, [CARRY, MOVE]), name, {
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
