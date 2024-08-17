import * as PickupTask from 'tasks/pickup'
import * as TaskRunner from 'tasks/runner'
import * as TransferTask from 'tasks/transfer'
import * as WithdrawTask from 'tasks/withdraw'
import { ResourceCreep, ResourceCreepMemory } from 'tasks/types'
import { LogisticsCreep } from './logistics-constants'
import { fromBodyPlan } from 'utils/parts'
import { profile } from 'utils/profiling'

const ROLE = 'energy-hauler'

export interface EnergyHauler extends ResourceCreep {
    memory: EnergyHaulerMemory
}

interface EnergyHaulerMemory extends ResourceCreepMemory {
    role: 'energy-hauler'
    home: string
}

export function isEnergyHauler(creep: Creep): creep is EnergyHauler {
    return (creep as LogisticsCreep).memory.role === ROLE
}

export class EnergyHaulerCreep {
    readonly creep: EnergyHauler

    constructor(creep: EnergyHauler) {
        this.creep = creep
    }

    get memory(): EnergyHaulerMemory {
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
            this.deliverEnergy()
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
        const success = PickupTask.makeRequest(this.creep)
        if (success) {
            return
        }

        WithdrawTask.makeRequest(this.creep, {
            sortBy: 'amount',
        })
    }

    @profile
    deliverEnergy(): void {
        TransferTask.makeRequest(this.creep)
    }
}

const roleEnergyHauler = {
    run(creep: EnergyHauler): void {
        const energyHauler = new EnergyHaulerCreep(creep)
        energyHauler.run()
    },

    create(spawn: StructureSpawn): number {
        const name = `${ROLE}:${spawn.room.name}:${Game.time}`
        return spawn.spawnCreep(fromBodyPlan(spawn.room.energyAvailable, [CARRY, MOVE]), name, {
            memory: {
                role: ROLE,
                home: spawn.room.name,
                tasks: [],
                idleTimestamp: null,
            } as EnergyHaulerMemory,
        })
    },
}

export default roleEnergyHauler
