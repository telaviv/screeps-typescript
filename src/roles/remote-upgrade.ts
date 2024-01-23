/* eslint no-lonely-if: ["off"] */

import * as TaskRunner from 'tasks/runner'
import { moveToRoom, recycle } from 'utils/creep'
import { profile } from 'utils/profiling'
import { getEnergy, hasNoEnergy, isFullOfEnergy } from 'utils/energy-harvesting'
import * as Logger from 'utils/logger'
import { fromBodyPlan } from 'utils/parts'

const ROLE = 'remote-upgrade'

export interface RemoteUpgrade extends ResourceCreep {
    memory: RemoteUpgradeMemory
}

interface RemoteUpgradeMemory extends ResourceCreepMemory {
    role: 'remote-upgrade'
    destination: string
    home: string
}

class RemoteUpgradeCreep {
    readonly creep: RemoteUpgrade

    constructor(creep: RemoteUpgrade) {
        this.creep = creep
    }

    get destination(): string {
        return this.memory.destination
    }

    get home(): string {
        return this.memory.home
    }

    get memory(): RemoteUpgradeMemory {
        return this.creep.memory
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

        if (this.isAtHome()) {
            if (this.shouldRecycle()) {
                recycle(this.creep)
            } else if (!this.isFullOfEnergy()) {
                getEnergy(this.creep)
            } else {
                this.goToDestination()
            }
        } else if (this.isAtDestination()) {
            if (this.hasNoEnergy()) {
                this.goHome()
            } else {
                this.upgradeController()
            }
        } else {
            if (this.hasNoEnergy()) {
                this.goHome()
            } else {
                this.goToDestination()
            }
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
        const controller = this.creep.room.controller
        const err = this.creep.upgradeController(controller!)
        if (err === ERR_NOT_IN_RANGE) {
            this.creep.moveTo(controller!, {
                visualizePathStyle: { stroke: '#ffffff' },
                range: 3,
            })
        } else if (err !== OK) {
            Logger.warning(
                'remote-upgrade:upgrade:failure',
                err,
                this.creep.name,
            )
        }
    }

    private goHome() {
        moveToRoom(this.home, this.creep)
    }

    private goToDestination() {
        moveToRoom(this.destination, this.creep)
    }

    private isAtHome() {
        return this.creep.room.name === this.home
    }

    private isAtDestination() {
        return this.creep.room.name === this.destination
    }
}

export default {
    run: (creep: RemoteUpgrade) => {
        const remoteUpgrade = new RemoteUpgradeCreep(creep)
        remoteUpgrade.run()
    },

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
            } as RemoteUpgradeMemory,
        })
    },
}
