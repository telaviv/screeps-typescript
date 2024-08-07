import * as Logger from 'utils/logger'
import { goHome, moveTo, recycle, wander } from 'utils/creep'
import { fromBodyPlan } from 'utils/parts'
import { getInvaderCores } from 'utils/room'
import { moveToRoom } from 'utils/travel'
import { wrap } from 'utils/profiling'

const ROLE = 'attack'

export interface Attacker extends Creep {
    memory: AttackerMemory
}

interface AttackerMemory extends CreepMemory {
    role: 'attack'
    roomName: string
    home: string
}

function sortHostiles(hostiles: Creep[]): Creep[] {
    hostiles.sort((a, b) => {
        if (a.getActiveBodyparts(ATTACK) > 0 && b.getActiveBodyparts(ATTACK) === 0) {
            return -1
        } else if (a.getActiveBodyparts(ATTACK) === 0 && b.getActiveBodyparts(ATTACK) > 0) {
            return 1
        }
        return 0
    })
    return hostiles
}

const roleAttacker = {
    run: wrap((creep: Attacker): void => {
        if (creep.spawning) {
            return
        }

        const targetRoom = Game.rooms[creep.memory.roomName]
        if (!targetRoom || !targetRoom.controller) {
            Logger.warning('attacker:no-controller', creep.name)
            return
        }

        if (targetRoom.controller.safeMode) {
            Logger.info(
                'attacker:safeMode',
                creep.name,
                targetRoom.name,
                targetRoom.controller.safeMode,
            )
            wander(creep)
            return
        }

        if (!roleAttacker.isInRoom(creep)) {
            moveToRoom(targetRoom.name, creep)
            return
        }

        const structures = getInvaderCores(targetRoom)
        const hostiles = sortHostiles(targetRoom.find(FIND_HOSTILE_CREEPS))
        const targets = [...structures, ...hostiles]
        if (targets.length > 0) {
            roleAttacker.attack(creep, targets[0])
            return
        } else {
            wander(creep)
        }
        // invader rooms require non stop vigilance
        // roleAttacker.cleanup(creep)
    }, 'runAttacker'),

    isInRoom: (creep: Attacker): boolean => {
        return (
            creep.room.name === creep.memory.roomName &&
            creep.pos.x > 0 &&
            creep.pos.y > 0 &&
            creep.pos.x < 49 &&
            creep.pos.y < 49
        )
    },

    attack: (creep: Attacker, target: Creep | Structure): ScreepsReturnCode => {
        const err = creep.attack(target)
        if (err === ERR_NOT_IN_RANGE) {
            // eslint-disable-next-line @typescript-eslint/no-shadow
            if (target instanceof Creep) {
                creep.moveTo(target)
            } else {
                moveTo(target.pos, creep, { range: 1 })
            }
        } else if (err !== OK) {
            Logger.error('attacker:attack:failed', creep.name, err)
        }
        return err
    },

    cleanup(creep: Creep): void {
        if (creep.room.name === creep.memory.home) {
            recycle(creep)
            return
        }
        goHome(creep)
        Logger.info('attacker:no-targets', creep.name)
    },

    create(
        spawn: StructureSpawn,
        roomName: string,
        capacity: number | null = null,
        maxAttackParts: number | null = null,
    ): number {
        capacity = capacity ? capacity : spawn.room.energyCapacityAvailable
        return spawn.spawnCreep(calculateParts(capacity, maxAttackParts), `${ROLE}:${Game.time}`, {
            memory: {
                role: ROLE,
                home: spawn.room.name,
                roomName,
            } as AttackerMemory,
        })
    },
}

export function calculateParts(
    capacity: number,
    maxCopies: number | null = null,
): BodyPartConstant[] {
    maxCopies = maxCopies ? maxCopies : 50
    return fromBodyPlan(capacity, [ATTACK, MOVE], [], maxCopies)
}

export default roleAttacker
