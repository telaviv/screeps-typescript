import includes from 'lodash/includes'

import autoIncrement from 'utils/autoincrement'
import { fromBodyPlan } from 'utils/parts'
import { wrap } from 'utils/profiling'
import * as Logger from 'utils/logger'
import EnergySourceManager from 'managers/energy-source-manager'

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
        if (creep.room.controller.owner || creep.room.controller.reservation) {
            err = creep.attackController(creep.room.controller)
            if (err === ERR_NOT_IN_RANGE) {
                creep.moveTo(creep.room.controller, {
                    visualizePathStyle: { stroke: '#ffaa00' },
                })
            } else if (!includes([OK, ERR_TIRED], err)) {
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

    create(spawn: StructureSpawn, roomName: string, minimal = false): number {
        const energyAvailable = EnergySourceManager.getEnergyAvailable(spawn.room)
        let parts
        if (minimal) {
            parts = [CLAIM, MOVE]
        } else {
            parts = calculateParts(energyAvailable)
        }
        const err = spawn.spawnCreep(parts, `${ROLE}:${autoIncrement()}`, {
            memory: {
                role: ROLE,
                home: spawn.room.name,
                roomName,
            } as ClaimerMemory,
        })
        if (err === ERR_NOT_ENOUGH_ENERGY) {
            Logger.warning('claimer:create:failed', spawn.room.name, parts, energyAvailable)
        }
        return err
    },
}

export function calculateParts(capacity: number): BodyPartConstant[] {
    return fromBodyPlan(capacity, [CLAIM, MOVE])
}

export default roleClaimer
