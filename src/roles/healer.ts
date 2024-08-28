import * as Logger from 'utils/logger'
import { followCreep, moveToRoom } from 'utils/travel'
import { getInjuredCreeps } from 'utils/room'
import { wrap } from 'utils/profiling'

const ROLE = 'healer'

export interface Healer extends Creep {
    memory: HealerMemory
}

export interface HealerMemory extends CreepMemory {
    role: 'healer'
    roomName: string
    home: string
}

const roleHealer = {
    run: wrap((creep: Healer) => {
        if (creep.spawning) {
            return
        }

        if (creep.memory.roomName !== creep.room.name) {
            moveToRoom(creep, creep.memory.roomName)
            return
        }

        const targets = getInjuredCreeps(creep.room)
        if (targets.length === 0) {
            return
        }

        if (creep.getActiveBodyparts(HEAL) === 0) {
            return
        }

        const target = targets[0]
        followCreep(creep, target)
        const err = creep.heal(target)
        if (err !== OK && err !== ERR_NOT_IN_RANGE) {
            Logger.warning(
                'healer:heal:failed',
                creep.name,
                creep.pos,
                creep.room.name,
                target,
                err,
            )
        }
    }, 'runHealer'),

    create(spawn: StructureSpawn, roomName: string): number {
        return spawn.spawnCreep([HEAL, MOVE], `${ROLE}:${Game.time}`, {
            memory: {
                role: ROLE,
                home: spawn.room.name,
                roomName,
            } as HealerMemory,
        })
    },
}

export default roleHealer
