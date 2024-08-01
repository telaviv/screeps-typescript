import * as Logger from 'utils/logger'
import { goHome, moveToRoom, moveWithinRoom, recycle } from 'utils/creep'
import { fromBodyPlan } from 'utils/parts'
import { getInvaderCores } from 'utils/room'
import { getRandomWalkablePosition } from 'utils/room-position'
import { randomElement } from 'utils/utilities'
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

const roleAttacker = {
    run: wrap((creep: Attacker) => {
        if (creep.spawning) {
            return
        }

        const targetRoom = Game.rooms[creep.memory.roomName]
        if (!targetRoom || !targetRoom.controller) {
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

        if (!roleAttacker.isInRoom(creep)) {
            moveToRoom(targetRoom.name, creep)
            return
        }

        const structures = getInvaderCores(targetRoom)
        const hostiles = targetRoom.find(FIND_HOSTILE_CREEPS)
        const targets = [...structures, ...hostiles]
        if (targets.length > 0) {
            roleAttacker.attack(creep, targets[0])
            return
        } else {
            const pos = getRandomWalkablePosition(creep.pos)
            Logger.error('attacker:no-targets', creep.name, pos)
            if (pos) {
                // we need to move simply to get out of the way of creeps
                creep.move(
                    randomElement([
                        TOP,
                        BOTTOM,
                        LEFT,
                        RIGHT,
                        TOP_LEFT,
                        TOP_RIGHT,
                        BOTTOM_LEFT,
                        BOTTOM_RIGHT,
                    ]),
                )
            }
            // invader rooms require non stop vigilance
            // roleAttacker.cleanup(creep)
        }
    }, 'runAttacker'),

    isInRoom(creep: Attacker): boolean {
        return (
            creep.room.name === creep.memory.roomName &&
            creep.pos.x > 1 &&
            creep.pos.y > 1 &&
            creep.pos.x < 48 &&
            creep.pos.y < 48
        )
    },

    attack(creep: Attacker, target: Creep | Structure): ScreepsReturnCode {
        const err = creep.attack(target)
        if (err === ERR_NOT_IN_RANGE) {
            // eslint-disable-next-line @typescript-eslint/no-shadow
            const err = moveWithinRoom(target.pos, creep, { range: 1 })
            if (err !== OK && err !== ERR_TIRED) {
                Logger.error(
                    'attacker:moveTo:target:failed',
                    creep.name,
                    JSON.stringify(target.pos),
                    err,
                )
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
