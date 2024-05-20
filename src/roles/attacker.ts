import { wrap } from 'utils/profiling'
import * as Logger from 'utils/logger'
import { fromBodyPlan } from 'utils/parts'
import WarDepartment, { WarStatus } from 'war-department'
import { getIn } from 'immutable'
import { getInvaderCores } from 'utils/room'
import { moveTo } from 'utils/creep'

const ROLE = 'attack'

export interface Attacker extends Creep {
    memory: AttackerMemory
}

interface AttackerMemory extends CreepMemory {
    role: 'attack'
    roomName: string
    home: string
}

const roleAttacker = {
    run: wrap((creep: Attacker) => {
        const targetRoom = Game.rooms[creep.memory.roomName]!
        if (!targetRoom.controller) {
            Logger.warning('attacker:no-controller', creep.name)
            return
        }

        if (targetRoom.controller.safeMode) {
            Logger.warning(
                'attacker:safeMode',
                creep.name,
                targetRoom.name,
                targetRoom.controller.safeMode,
            )
            return
        }
        const structures = getInvaderCores(targetRoom)
        const hostiles = targetRoom.find(FIND_HOSTILE_CREEPS)
        const targets = [...structures, ...hostiles]

        if (targets.length > 0) {
            const target = targets[0];
            const err = creep.attack(target)
            if (err === ERR_NOT_IN_RANGE) {
                const err = moveTo(target.pos, creep, { range: 1 })
                if (err !== OK) {
                    Logger.error('attacker:moveTo:target:failed', creep.name, JSON.stringify(target.pos), err)
                }
            } else if (err !== OK) {
                Logger.error('attacker:attack:failed', creep.name, err)
            }
            return
        } else {
            Logger.info('attacker:no-targets', creep.name)
        }
    }, 'runAttacker'),

    create(spawn: StructureSpawn, roomName: string): number {
        const capacity = spawn.room.energyCapacityAvailable
        return spawn.spawnCreep(
            calculateParts(capacity),
            `${ROLE}:${Game.time}`,
            {
                memory: {
                    role: ROLE,
                    home: spawn.room.name,
                    roomName,
                } as AttackerMemory,
            },
        )
    },
}

export function calculateParts(capacity: number): BodyPartConstant[] {
    return fromBodyPlan(capacity, [ATTACK, MOVE])
}

export default roleAttacker
