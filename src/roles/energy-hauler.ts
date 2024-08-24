import * as PickupTask from 'tasks/pickup'
import * as TaskRunner from 'tasks/runner'
import * as TransferTask from 'tasks/transfer'
import * as WithdrawTask from 'tasks/withdraw'
import { ResourceCreep, ResourceCreepMemory } from 'tasks/types'
import { LogisticsCreep } from './logistics-constants'
import { fromBodyPlan } from 'utils/parts'
import { getVirtualStorage } from '../utils/virtual-storage'
import { isWithdrawTask } from 'tasks/withdraw/utils'
import { moveWithinRoom } from 'utils/travel'
import { profile } from 'utils/profiling'

const ROLE = 'energy-hauler'

export interface EnergyHauler extends ResourceCreep {
    memory: EnergyHaulerMemory
}

interface EnergyHaulerMemory extends ResourceCreepMemory {
    role: 'energy-hauler'
    home: string
    lastWithdraw?: { id: string; time: number }
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
            this.runTask()
            return
        } else if (this.creep.store.getUsedCapacity() < 50) {
            this.collectEnergy()
        } else {
            this.deliverEnergy()
        }
        if (this.creep.memory.tasks.length > 0) {
            this.runTask()
            return
        } else if (this.creep.store.getUsedCapacity() > 0) {
            this.deliverEnergy()
        } else {
            this.collectEnergy()
        }

        if (this.creep.memory.tasks.length > 0) {
            this.runTask()
        } else if (getVirtualStorage(this.creep.memory.home)) {
            const virtualStorage = getVirtualStorage(this.creep.room.name) as
                | StructureStorage
                | StructureContainer
            if (this.creep.pos.isNearTo(virtualStorage)) {
                return
            }
            moveWithinRoom(this.creep, { pos: virtualStorage.pos, range: 1 })
        }
    }

    runTask(): void {
        if (this.creep.memory.tasks.length > 0) {
            const task = this.creep.memory.tasks[0]
            if (task.type === 'pickup' || task.type === 'withdraw') {
                this.creep.say('🚚⚡')
                if (task.type === 'withdraw' && isWithdrawTask(task)) {
                    this.creep.memory.lastWithdraw = { id: task.withdrawId, time: Game.time }
                } else {
                    this.creep.memory.lastWithdraw = undefined
                }
            } else {
                this.creep.say('🚚🚚')
            }
            TaskRunner.run(task, this.creep)
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
        const success = TransferTask.makeRequest(this.creep, { excludeVirtualStorage: true })
        if (success) {
            return
        }
        const virtualStorage = getVirtualStorage(this.creep.memory.home)
        if (virtualStorage) {
            if (
                this.creep.memory.lastWithdraw &&
                this.creep.memory.lastWithdraw.id === virtualStorage.id
            ) {
                return
            }
            TransferTask.makeRequest(this.creep, { structure: virtualStorage })
        }
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
