/* eslint no-lonely-if: ["off"] */

import * as TaskRunner from 'tasks/runner'
import { moveToRoom, recycle } from 'utils/creep'
import { profile, wrap } from 'utils/profiling'
import { hasNoEnergy, isFullOfEnergy } from 'utils/energy-harvesting'
import * as Logger from 'utils/logger'
import { fromBodyPlan } from 'utils/parts'
import { ResourceCreep, ResourceCreepMemory } from 'tasks/types'
import { addEnergyTask } from 'tasks/usage-utils'

const ROLE = 'remote-upgrade'

export interface RemoteUpgrade extends ResourceCreep {
    memory: RemoteUpgradeMemory
}

interface RemoteUpgradeMemory extends ResourceCreepMemory {
    role: 'remote-upgrade'
    destination: string
    home: string
    collecting: boolean
}

class RemoteUpgradeCreep {
    readonly creep: RemoteUpgrade

    constructor(creep: RemoteUpgrade) {
        this.creep = creep
    }

    get destination(): string {
        return this.memory.destination
    }

    get destinationRoom(): Room {
        return Game.rooms[this.destination]
    }

    get home(): string {
        return this.memory.home
    }

    get memory(): RemoteUpgradeMemory {
        return this.creep.memory
    }

    get collecting(): boolean {
        return this.memory.collecting
    }

    @profile
    run() {
        if (this.creep.spawning) {
            return
        }

        if (this.creep.memory.tasks.length > 0) {
            const task = this.creep.memory.tasks[0]
            TaskRunner.run(task, this.creep)
            return
        }

        if (this.collecting) {
            if (this.isFullOfEnergy()) {
                this.memory.collecting = false
                this.upgradeController()
            } else {
                this.collectEnergy()
            }
        } else {
            if (this.hasNoEnergy()) {
                this.memory.collecting = true
                this.collectEnergy()
            } else {
                this.upgradeController()
            }
        }
    }

    private collectEnergy(): void {
        this.creep.say('⚡')
        if (!addEnergyTask(this.creep)) {
            this.creep.say('🤔')
            return
        }
    }

    private shouldRecycle() {
        const roundTripTime: number = this.roundTripTime()
        const ticksToLive: number = this.creep.ticksToLive!
        return ticksToLive < roundTripTime + 50
    }

    private hasNoEnergy() {
        return hasNoEnergy(this.creep)
    }

    private isFullOfEnergy() {
        return isFullOfEnergy(this.creep)
    }

    private travelDistance(): number {
        return Game.map.getRoomLinearDistance(this.home, this.destination) * 50
    }

    private roundTripTime(): number {
        return 2 * this.travelDistance() + this.creep.getActiveBodyparts(CARRY)
    }

    private upgradeController() {
        this.creep.say('🌃')
        const controller = this.destinationRoom.controller
        const err = this.creep.upgradeController(controller!)
        if (err === ERR_NOT_IN_RANGE) {
            this.creep.moveTo(controller!, {
                visualizePathStyle: { stroke: '#ffffff' },
                range: 3,
            })
        } else if (err !== OK) {
            Logger.error('remote-upgrade:upgrade:failure', controller, err, this.creep.name)
        }
    }
}

export default {
    run: wrap((creep: RemoteUpgrade) => {
        const remoteUpgrade = new RemoteUpgradeCreep(creep)
        remoteUpgrade.run()
    }, 'roleRemoteUpgrade:run'),

    create(spawn: StructureSpawn, destination: string): number {
        const capacity = spawn.room.energyCapacityAvailable
        const parts = fromBodyPlan(capacity, [CARRY, MOVE], [WORK, MOVE])
        return spawn.spawnCreep(parts, `${ROLE}:${Game.time}`, {
            memory: {
                role: ROLE,
                home: spawn.room.name,
                destination,
                tasks: [],
                idleTimestamp: null,
                collecting: true,
            } as RemoteUpgradeMemory,
        })
    },
}
