import * as TaskRunner from 'tasks/runner'
import { moveToRoom, recycle } from 'utils/creep'
import { profile } from 'utils/profiling'
import { getEnergy, isFullOfEnergy, hasNoEnergy } from 'utils/energy-harvesting'
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
            Logger.debug('remote-upgrade:run:debug:1', this.creep.name)
            return
        }

        Logger.debug(
            'remote-upgrade:run:roundTripTime',
            this.creep.name,
            this.creep.room.name,
            this.creep.memory.home,
            this.roundTripTime(),
            this.creep.ticksToLive,
        )

        if (this.creep.memory.tasks.length > 0) {
            const task = this.creep.memory.tasks[0]
            TaskRunner.run(task, this.creep)
            return
        }

        if (this.isAtHome()) {
            Logger.debug('remote-upgrade:run:debug:2', this.creep.name)
            if (this.shouldRecycle()) {
                Logger.debug('remote-upgrade:run:debug:3', this.creep.name)
                recycle(this.creep)
            } else if (!this.isFullOfEnergy()) {
                Logger.debug('remote-upgrade:run:debug:4', this.creep.name)
                getEnergy(this.creep)
            } else {
                Logger.debug('remote-upgrade:run:debug:5', this.creep.name)
                this.goToDestination()
            }
        } else if (this.isAtDestination()) {
            Logger.debug('remote-upgrade:run:debug:6', this.creep.name)
            if (this.hasNoEnergy()) {
                Logger.debug('remote-upgrade:run:debug:7', this.creep.name)
                this.goHome()
            } else {
                Logger.debug('remote-upgrade:run:debug:8', this.creep.name)
                this.upgradeController()
            }
        } else {
            Logger.debug('remote-upgrade:run:debug:9', this.creep.name)
            if (this.hasNoEnergy()) {
                Logger.debug('remote-upgrade:run:debug:10', this.creep.name)
                this.goHome()
            } else {
                Logger.debug('remote-upgrade:run:debug:11', this.creep.name)
                this.goToDestination()
            }
        }
        Logger.debug('remote-upgrade:run:debug:12', this.creep.name)
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
                waitTime: 0,
            } as RemoteUpgradeMemory,
        })
    },
}
