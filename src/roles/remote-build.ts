/* eslint no-lonely-if: ["off"] */

import * as Logger from 'utils/logger'
import * as TaskRunner from 'tasks/runner'
import { ResourceCreep, ResourceCreepMemory } from 'tasks/types'
import { hasNoEnergy, isFullOfEnergy } from 'utils/energy-harvesting'
import { profile, wrap } from 'utils/profiling'
import { addEnergyTask } from 'tasks/usage-utils'
import autoIncrement from 'utils/autoincrement'
import { fromBodyPlan } from 'utils/parts'
import { getConstructionSites } from 'utils/room'
import { moveTo } from 'utils/creep'

const ROLE = 'remote-build'

export interface RemoteBuild extends ResourceCreep {
    memory: RemoteBuildMemory
}

interface RemoteBuildMemory extends ResourceCreepMemory {
    role: 'remote-build'
    destination: string
    home: string
    collecting: boolean
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
                this.build()
            } else {
                this.collectEnergy()
            }
        } else {
            if (this.hasNoEnergy()) {
                this.memory.collecting = true
                this.collectEnergy()
            } else {
                this.build()
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
        const ticksToLive: number = this.creep.ticksToLive || 0
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
        this.creep.say('🏗️')
        const destination = Game.rooms[this.destination]
        const targets = getConstructionSites(destination)
        if (targets.length) {
            const err = this.creep.build(targets[0])
            if (err === ERR_NOT_IN_RANGE) {
                moveTo(targets[0].pos, this.creep, { range: 3 })
            } else if (err !== OK) {
                Logger.warning('remote-build:build:failure', err, this.creep.name, targets[0].pos)
            }
        } else {
            Logger.warning(
                'remote-build:build:failure',
                'nothing to build',
                this.creep.memory.home,
                this.creep.room.name,
                destination,
            )
        }
    }
}

export default {
    run: wrap((creep: RemoteBuild) => {
        const remoteBuild = new RemoteBuildCreep(creep)
        remoteBuild.run()
    }, 'roleRemoteBuild:run'),

    create(spawn: StructureSpawn, destination: string): number {
        const capacity = spawn.room.energyCapacityAvailable
        const parts = fromBodyPlan(capacity, [CARRY, MOVE], [WORK, MOVE])
        return spawn.spawnCreep(parts, `${ROLE}:${autoIncrement()}`, {
            memory: {
                role: ROLE,
                home: spawn.room.name,
                destination,
                tasks: [],
                idleTimestamp: null,
                collecting: false,
            } as RemoteBuildMemory,
        })
    },
}
