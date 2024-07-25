import { ResourceCreep, ResourceCreepMemory } from 'tasks/types'
import { createTravelTask, run as travelTaskRunner } from 'tasks/travel'
import { profile, wrap } from 'utils/profiling'
import { LogisticsCreep } from './logistics-constants'
import { isTravelTask } from 'tasks/travel/utils'

const ROLE = 'scout'

export interface Scout extends ResourceCreep {
    memory: ScoutMemory
}

interface ScoutMemory extends ResourceCreepMemory {
    role: 'scout'
    home: string
}

export function isScout(creep: Creep): creep is Scout {
    return (creep as LogisticsCreep).memory.role === ROLE
}

export class ScoutCreep {
    readonly creep: Scout

    constructor(creep: Scout) {
        this.creep = creep
    }

    get memory(): ScoutMemory {
        return this.creep.memory
    }

    @profile
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    run(): void {
        if (this.creep.spawning) {
            this.creep.notifyWhenAttacked(false)
            return
        }
        if (this.creep.memory.tasks.length === 0) {
            return
        }
        if (isTravelTask(this.creep.memory.tasks[0])) {
            travelTaskRunner(this.creep.memory.tasks[0], this.creep)
        }
    }
}

const roleScout = {
    run: wrap((creep: Scout) => {
        const scout = new ScoutCreep(creep)
        scout.run()
    }, 'roleScout:run'),

    create(
        spawn: StructureSpawn,
        destination: string,
        permanent = false,
        opts: SpawnOptions = {},
    ): number {
        const name = `${ROLE}:${Game.time}`
        return spawn.spawnCreep([MOVE], name, {
            memory: {
                role: ROLE,
                home: spawn.room.name,
                tasks: [createTravelTask(name, destination, permanent)],
                idleTimestamp: null,
            } as ScoutMemory,
            ...opts,
        })
    },
}

export default roleScout
