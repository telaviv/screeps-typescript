import includes from 'lodash/includes'

import autoIncrement from 'utils/autoincrement'
import { fromBodyPlan, fromBodyPlanSafe } from 'utils/parts'
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
        const targetRoom = Game.rooms[creep.memory.roomName]
        if (!targetRoom || !targetRoom.controller) {
            Logger.warning('claimer:no-controller', creep.name)
            return
        }
        if (targetRoom.controller.my) {
            Logger.info('claimer:room-is-mine', creep.name, targetRoom.name)
            creep.suicide()
            return
        }

        if (targetRoom.controller.owner || targetRoom.controller.reservation) {
            const err = creep.attackController(targetRoom.controller)
            if (err === ERR_NOT_IN_RANGE) {
                creep.moveTo(targetRoom.controller, {
                    visualizePathStyle: { stroke: '#ffaa00' },
                })
            } else if (!includes([OK, ERR_TIRED], err)) {
                Logger.warning('claimer:attack:failed', creep.name, err)
            }
        } else {
            const err = creep.claimController(targetRoom.controller)
            if (err === ERR_NOT_IN_RANGE) {
                creep.moveTo(targetRoom.controller, {
                    visualizePathStyle: { stroke: '#ffaa00' },
                })
            } else if (err !== OK) {
                Logger.warning('claimer:claim:failed', creep.name, err)
            }
        }
    }, 'runClaimer'),

    canCreate(spawn: StructureSpawn): boolean {
        const energyAvailable = spawn.room.energyAvailable
        const parts = calculateParts(energyAvailable)
        return parts !== null;
    },

    create(spawn: StructureSpawn, roomName: string, minimal = false): number {
        const energyAvailable = spawn.room.energyAvailable
        let parts = calculateParts(energyAvailable)
        if (!parts) {
            Logger.warning(
                'claimer:create:failed',
                spawn.room.name,
                parts,
                energyAvailable,
            )
        }
        if (minimal) {
            parts = [CLAIM, MOVE]
        }

        const err = spawn.spawnCreep(parts!, `${ROLE}:${autoIncrement()}`, {
            memory: {
                role: ROLE,
                home: spawn.room.name,
                roomName,
            } as ClaimerMemory,
        })
        if (err === ERR_NOT_ENOUGH_ENERGY) {
            throw new Error('not enough energy to make claimer')
        }
        return err
    },
}

export function calculateParts(capacity: number): BodyPartConstant[] | null {
    return fromBodyPlanSafe(capacity, [CLAIM, MOVE])
}

export default roleClaimer
