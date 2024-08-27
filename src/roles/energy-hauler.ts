import { sortBy } from 'lodash'

import * as PickupTask from 'tasks/pickup'
import * as TaskRunner from 'tasks/runner'
import * as TransferTask from 'tasks/transfer'
import * as WithdrawTask from 'tasks/withdraw'
import { ResourceCreep, ResourceCreepMemory } from 'tasks/types'
import { getSpawns, getTowers } from 'utils/room'
import { LogisticsCreep } from './logistics-constants'
import { fromBodyPlan } from 'utils/parts'
import { getRenewInformation } from 'utils/creep'
import { getVirtualStorage } from '../utils/virtual-storage'
import { isWithdrawTask } from 'tasks/withdraw/utils'
import { moveWithinRoom } from 'utils/travel'
import { profile } from 'utils/profiling'

const ROLE = 'energy-hauler'
const MAX_CARRY_CAPACITY = 1100

export interface EnergyHauler extends ResourceCreep {
    memory: EnergyHaulerMemory
}

interface EnergyHaulerMemory extends ResourceCreepMemory {
    role: 'energy-hauler'
    home: string
    lastWithdraw?: { id: string; time: number }
    creationCapacity: number
    roadsBuilt: boolean
    autoRenew: boolean
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

    get autoRenew(): boolean {
        return this.memory.autoRenew ?? false
    }

    get energy(): number {
        return this.creep.store.getUsedCapacity(RESOURCE_ENERGY)
    }

    @profile
    run(): void {
        if (this.creep.spawning || this.nothingToDo()) {
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
            this.runTask(false)
            return
        }

        const spawns = getSpawns(this.creep.room)
        if (spawns.length === 0 || this.autoRenew === false) {
            return
        }
        const sortedSpawns = sortBy(spawns, (spawn) => spawn.pos.getRangeTo(this.creep))
        const closestSpawn = sortedSpawns[0]
        if (!this.creep.pos.isNearTo(closestSpawn)) {
            moveWithinRoom(this.creep, { pos: closestSpawn.pos, range: 1 })
        } else if (this.canAutoRenew()) {
            this.autoRenewCreep(closestSpawn)
        }
    }

    nothingToDo(): boolean {
        const towers = getTowers(this.creep.room)
        const towersFilled = towers.every(
            (tower) =>
                tower.store.getFreeCapacity(RESOURCE_ENERGY) <
                tower.store.getCapacity(RESOURCE_ENERGY) * 0.75,
        )
        return (
            towersFilled &&
            this.creep.room.energyAvailable === this.creep.room.energyCapacityAvailable &&
            (this.creep.ticksToLive ?? 0) > 1250
        )
    }

    canAutoRenew(): boolean {
        const { cost, ticks } = getRenewInformation(this.creep)
        const spawns = getSpawns(this.creep.room)
        return (
            spawns.length > 0 &&
            spawns[0].spawning === null &&
            cost <= this.energy &&
            CREEP_LIFE_TIME - (this.creep.ticksToLive ?? 0) > ticks
        )
    }

    runTask(say = true): void {
        if (this.creep.memory.tasks.length > 0) {
            const task = this.creep.memory.tasks[0]
            if (task.type === 'pickup' || task.type === 'withdraw') {
                if (say) this.creep.say('🚚⚡')
                if (task.type === 'withdraw' && isWithdrawTask(task)) {
                    this.creep.memory.lastWithdraw = { id: task.withdrawId, time: Game.time }
                } else {
                    this.creep.memory.lastWithdraw = undefined
                }
            } else if (task.type === 'transfer') {
                if (say) this.creep.say('🚚🚚')
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

    @profile
    autoRenewCreep(spawn: StructureSpawn): void {
        spawn.renewCreep(this.creep)
        this.creep.say('🚚⏳')
    }
}

const roleEnergyHauler = {
    run(creep: EnergyHauler): void {
        const energyHauler = new EnergyHaulerCreep(creep)
        energyHauler.run()
    },

    shouldCancelAutoRenew(creep: EnergyHauler, capacity: number, roadsBuilt: boolean): boolean {
        return (
            (creep.memory.autoRenew && creep.memory.creationCapacity < capacity) ||
            !!roadsBuilt !== !!creep.memory.roadsBuilt
        )
    },

    cancelAutoRenew(creep: EnergyHauler): void {
        creep.memory.autoRenew = false
    },

    create(spawn: StructureSpawn, capacity?: number, roadsBuilt = false): number {
        if (!capacity) {
            capacity = spawn.room.energyCapacityAvailable
        }
        const name = `${ROLE}:${spawn.room.name}:${Game.time}`
        let maxCopies = MAX_CARRY_CAPACITY / CARRY_CAPACITY
        let bodyPlan = [CARRY, MOVE]
        if (roadsBuilt) {
            maxCopies = MAX_CARRY_CAPACITY / (CARRY_CAPACITY * 2)
            bodyPlan = [CARRY, CARRY, MOVE]
        }
        return spawn.spawnCreep(fromBodyPlan(capacity, bodyPlan, { maxCopies }), name, {
            memory: {
                role: ROLE,
                home: spawn.room.name,
                tasks: [],
                idleTimestamp: null,
                creationCapacity: capacity,
                roadsBuilt,
                autoRenew: true,
            } as EnergyHaulerMemory,
        })
    },
}

export default roleEnergyHauler
