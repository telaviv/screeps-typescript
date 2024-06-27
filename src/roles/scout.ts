import * as TaskRunner from 'tasks/runner'
import { ResourceCreep, ResourceCreepMemory } from 'tasks/types'
import { profile, wrap } from 'utils/profiling'
import { createTravelTask } from 'tasks/travel'

const ROLE = 'scout'

export interface Scout extends ResourceCreep {
    memory: ScoutMemory
}

interface ScoutMemory extends ResourceCreepMemory {
    role: 'scout'
    destination: string
    home: string
}

class ScoutCreep {
    readonly creep: Scout

    constructor(creep: Scout) {
        this.creep = creep
    }

    get destination(): string {
        return this.memory.destination
    }

    get home(): string {
        return this.memory.home
    }

    get memory(): ScoutMemory {
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
    }
}

const roleScout = {
    run: wrap((creep: Scout) => {
        const scout = new ScoutCreep(creep)
        scout.run()
    }, 'roleScout:run'),

    create(spawn: StructureSpawn, destination: string, opts: SpawnOptions = {}): number {
        const name = `${ROLE}:${Game.time}`
        return spawn.spawnCreep([MOVE], name, {
            memory: {
                role: ROLE,
                home: spawn.room.name,
                tasks: [createTravelTask(name, destination)],
                destination,
                idleTimestamp: null,
            } as ScoutMemory,
            ...opts,
        })
    },
}

export default roleScout
