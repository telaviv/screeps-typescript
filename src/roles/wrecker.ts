import { wrap } from 'utils/profiling'
import * as Logger from 'utils/logger'

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
            creep.moveTo(new RoomPosition(25, 25, creep.memory.roomName), {
                range: 25,
                visualizePathStyle: { stroke: '#ffaa00' },
            })
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

        const spawns = creep.room.find(FIND_HOSTILE_SPAWNS)

        if (spawns.length === 0) {
            // we should probably let the attack know to send a claimer
            creep.suicide()
        }

        const spawn = spawns[0]
        const err = creep.dismantle(spawn)
        if (err === ERR_NOT_IN_RANGE) {
            creep.moveTo(spawn, {
                visualizePathStyle: { stroke: '#ffaa00' },
            })
        } else if (err !== OK) {
            Logger.warning(
                'wrecker:dismantle:failed',
                creep.name,
                creep.pos,
                creep.room.name,
                err,
            )
        }
    }, 'runWrecker'),

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
                } as WreckerMemory,
            },
        )
    },
}

export function calculateParts(capacity: number): BodyPartConstant[] {
    let capacityLeft = capacity
    let parts: BodyPartConstant[] = []
    const chunkCost =
        BODYPART_COST[WORK] + BODYPART_COST[CARRY] + 2 * BODYPART_COST[MOVE]
    while (capacityLeft >= chunkCost) {
        parts = parts.concat([WORK, MOVE, CARRY, MOVE])
        capacityLeft -= chunkCost
    }
    return parts
}

export default roleWrecker
