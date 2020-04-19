import { wrap } from 'utils/profiling'
import * as Logger from 'utils/logger'

const ROLE = 'claimer'

export interface Claimer extends Creep {
    memory: ClaimerMemory
}

interface ClaimerMemory extends CreepMemory {
    role: 'claimer'
    roomName: string
}

const roleClaimer = {
    run: wrap((creep: Claimer) => {
        if (creep.room.name !== creep.memory.roomName) {
            creep.moveTo(new RoomPosition(25, 25, creep.memory.roomName), {
                range: 20,
                visualizePathStyle: { stroke: '#ffaa00' },
            })
            return
        }

        if (!creep.room.controller) {
            Logger.warning('claimer:no-controller', creep.name)
            return
        }

        let err
        if (creep.room.controller.owner) {
            err = creep.attackController(creep.room.controller)
            if (err === ERR_NOT_IN_RANGE) {
                creep.moveTo(creep.room.controller, {
                    visualizePathStyle: { stroke: '#ffaa00' },
                })
            } else if (err !== OK) {
                Logger.warning('claimer:attack:failed', creep.name, err)
            }
        } else {
            err = creep.claimController(creep.room.controller)
            if (err === ERR_NOT_IN_RANGE) {
                creep.moveTo(creep.room.controller, {
                    visualizePathStyle: { stroke: '#ffaa00' },
                })
            } else if (err !== OK) {
                Logger.warning('claimer:claim:failed', creep.name, err)
            }
        }
    }, 'runClaimer'),

    create(spawn: StructureSpawn, roomName: string): number {
        const parts = calculateParts()
        const err = spawn.spawnCreep(parts, `${ROLE}:${Game.time}`, {
            memory: {
                role: ROLE,
                roomName,
            } as ClaimerMemory,
        })
        return err
    },
}

export function calculateParts(): BodyPartConstant[] {
    return [CLAIM, MOVE]
}

export default roleClaimer
