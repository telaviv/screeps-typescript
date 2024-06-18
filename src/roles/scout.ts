import { moveToRoom } from 'utils/creep'
import { profile, wrap } from 'utils/profiling'

const ROLE = 'scout'

export interface Scout extends Creep {
    memory: ScoutMemory
}

interface ScoutMemory extends CreepMemory {
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
        moveToRoom(this.destination, this.creep)
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
        opts: SpawnOptions = {},
    ): number {
        return spawn.spawnCreep([MOVE], `${ROLE}:${Game.time}`, {
            memory: {
                role: ROLE,
                home: spawn.room.name,
                destination,
            } as ScoutMemory,
            ...opts,
        })
    },
}

export default roleScout
