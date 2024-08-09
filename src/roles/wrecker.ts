import * as Logger from 'utils/logger'
import { moveTo, moveToRoom } from 'utils/travel'
import { fromBodyPlan } from 'utils/parts'
import { wrap } from 'utils/profiling'

const ROLE = 'wrecker'

export interface Wrecker extends Creep {
    memory: WreckerMemory
}

interface WreckerMemory extends CreepMemory {
    role: 'wrecker'
    roomName: string
    home: string
}

const roleWrecker = {
    run: wrap((creep: Wrecker) => {
        if (creep.room.name !== creep.memory.roomName) {
            moveToRoom(creep, creep.memory.roomName)
            return
        }

        if (!creep.room.controller) {
            Logger.warning('wrecker:no-controller', creep.name)
            return
        }

        if (creep.room.controller.safeMode) {
            Logger.warning(
                'wrecker:safeMode',
                creep.name,
                creep.room.name,
                creep.room.controller.safeMode,
            )
            return
        }

        const targets = creep.room.find(FIND_HOSTILE_SPAWNS)

        const target = targets[0]
        const err = creep.dismantle(target)
        if (err === ERR_NOT_IN_RANGE) {
            moveTo(
                creep,
                { pos: target.pos, range: 1 },
                { visualizePathStyle: { stroke: '#ffaa00' } },
            )
        } else if (err !== OK) {
            Logger.warning(
                'wrecker:dismantle:failed',
                creep.name,
                creep.pos,
                creep.room.name,
                target,
                err,
            )
        }
    }, 'runWrecker'),

    create(spawn: StructureSpawn, roomName: string): number {
        const capacity = spawn.room.energyCapacityAvailable
        return spawn.spawnCreep(calculateParts(capacity), `${ROLE}:${Game.time}`, {
            memory: {
                role: ROLE,
                home: spawn.room.name,
                roomName,
            } as WreckerMemory,
        })
    },
}

export function calculateParts(capacity: number): BodyPartConstant[] {
    return fromBodyPlan(capacity, [WORK, CARRY, MOVE, MOVE])
}

export default roleWrecker
