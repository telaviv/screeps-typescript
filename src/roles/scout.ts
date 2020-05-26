import * as RoomStatus from 'room-status'
import { moveToRoom } from 'utils/creep'
import { profile } from 'utils/profiling'

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
        RoomStatus.recordStatus(this.creep.room)
        if (!this.isAtRoom()) {
            moveToRoom(this.destination, this.creep)
        }
    }

    private isAtRoom() {
        return this.creep.room.name === this.destination
    }
}

const roleScout = {
    run: (creep: Scout) => {
        const scout = new ScoutCreep(creep)
        scout.run()
    },

    create(spawn: StructureSpawn, destination: string): number {
        return spawn.spawnCreep([MOVE], `${ROLE}:${Game.time}`, {
            memory: {
                role: ROLE,
                home: spawn.room.name,
                destination,
            } as ScoutMemory,
        })
    },
}

export default roleScout
