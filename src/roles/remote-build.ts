/* eslint no-lonely-if: ["off"] */

import * as TaskRunner from 'tasks/runner'
import { moveToRoom, recycle } from 'utils/creep'
import { profile } from 'utils/profiling'
import { getEnergy, hasNoEnergy, isFullOfEnergy } from 'utils/energy-harvesting'
import { getConstructionSites } from 'utils/room'
import * as Logger from 'utils/logger'
import { fromBodyPlan } from 'utils/parts'
import autoIncrement from 'utils/autoincrement'

const ROLE = 'remote-build'

export interface RemoteBuild extends ResourceCreep {
    memory: RemoteBuildMemory
}

interface RemoteBuildMemory extends ResourceCreepMemory {
    role: 'remote-build'
    destination: string
    home: string
}

class RemoteBuildCreep {
    readonly creep: RemoteBuild

    constructor(creep: RemoteBuild) {
        this.creep = creep
    }

    get destination(): string {
        return this.memory.destination
    }

    get home(): string {
        return this.memory.home
    }

    get memory(): RemoteBuildMemory {
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
                this.build()
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

    private build() {
        const targets = getConstructionSites(this.creep.room)
        if (targets.length) {
            const err = this.creep.build(targets[0])
            if (err === ERR_NOT_IN_RANGE) {
                this.creep.moveTo(targets[0], {
                    visualizePathStyle: { stroke: '#ffffff' },
                    range: 3,
                })
            } else if (err !== OK) {
                Logger.warning(
                    'remote-build:build:failure',
                    err,
                    this.creep.name,
                )
            }
        } else {
            Logger.warning(
                'remote-build:build',
                'nothing to build',
                this.creep.room.name,
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
    run: (creep: RemoteBuild) => {
        const remoteBuild = new RemoteBuildCreep(creep)
        remoteBuild.run()
    },

    create(spawn: StructureSpawn, destination: string): number {
        const capacity = spawn.room.energyCapacityAvailable
        const parts = fromBodyPlan(capacity, [CARRY, MOVE], [WORK, MOVE])
        return spawn.spawnCreep(parts, `${ROLE}:${autoIncrement()}`, {
            memory: {
                role: ROLE,
                home: spawn.room.name,
                destination,
                tasks: [],
                waitTime: 0,
            } as RemoteBuildMemory,
        })
    },
}
