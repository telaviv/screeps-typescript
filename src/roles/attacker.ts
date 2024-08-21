import * as Logger from 'utils/logger'
import { followCreep, moveTo, moveToRoom } from 'utils/travel'
import { getHostileConstructionSites, getInvaderCores } from 'utils/room'
import { goHome, moveToStationaryPoint, recycle, wander } from 'utils/creep'
import { fromBodyPlan } from 'utils/parts'
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

function isCreep(target: Creep | Structure): target is Creep {
    return (target as Creep).hits !== undefined
}

const sortHostiles =
    (pos: RoomPosition) =>
    (hostiles: Creep[]): Creep[] => {
        hostiles.sort((a, b) => {
            if (a.getActiveBodyparts(ATTACK) > 0 && b.getActiveBodyparts(ATTACK) === 0) {
                return -1
            } else if (a.getActiveBodyparts(ATTACK) === 0 && b.getActiveBodyparts(ATTACK) > 0) {
                return 1
            }
            const claimDiff = b.getActiveBodyparts(CLAIM) - a.getActiveBodyparts(CLAIM)
            if (claimDiff !== 0) {
                return claimDiff
            }
            return pos.getRangeTo(a) - pos.getRangeTo(b)
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

        if (!roleAttacker.isInRoom(creep)) {
            moveToRoom(creep, targetRoom.name)
            return
        }

        const structures = getInvaderCores(targetRoom)
        const hostiles = sortHostiles(creep.pos)(targetRoom.find(FIND_HOSTILE_CREEPS))
        const constructionSites = getHostileConstructionSites(targetRoom)
        const targets = [...structures, ...hostiles]
        if (targets.length > 0) {
            roleAttacker.attack(creep, targets[0])
        } else if (constructionSites.length > 0) {
            moveToStationaryPoint(constructionSites[0].pos, creep)
        } else {
            wander(creep)
        }
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
        if (isCreep(target)) {
            followCreep(creep, target)
        } else {
            moveTo(creep, target)
        }
        const err = creep.attack(target)
        if (err !== OK && err !== ERR_NOT_IN_RANGE) {
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
    return fromBodyPlan(capacity, [ATTACK, MOVE], { maxCopies })
}

export default roleAttacker
