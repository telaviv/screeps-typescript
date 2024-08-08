import * as Logger from 'utils/logger'
import { getInjuredCreeps } from 'utils/room'
import { wrap } from 'utils/profiling'

const ROLE = 'healer'

export interface Healer extends Creep {
    memory: HealerMemory
}

interface HealerMemory extends CreepMemory {
    role: 'healer'
    roomName: string
    home: string
}

const roleHealer = {
    run: wrap((creep: Healer) => {
        if (creep.spawning) {
            return
        }
        const targets = getInjuredCreeps(creep.room)
        if (targets.length === 0) {
            return
        }

        const target = targets[0]
        const err = creep.heal(target)
        if (err === ERR_NOT_IN_RANGE) {
            creep.moveTo(target)
        } else if (err !== OK) {
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
