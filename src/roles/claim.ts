import includes from 'lodash/includes'

import * as Logger from 'utils/logger'
import { moveTo, moveToRoom } from 'utils/travel'
import autoIncrement from 'utils/autoincrement'
import { clearConstructionSites } from 'utils/room'
import { fromBodyPlanSafe } from 'utils/parts'
import { wrap } from 'utils/profiling'

const ROLE = 'claimer'

export interface Claimer extends Creep {
    memory: ClaimerMemory
}

interface ClaimerMemory extends CreepMemory {
    role: 'claimer'
    roomName: string
    attack?: boolean
}

interface CreateOptions {
    minimal?: boolean
    attack?: boolean
}

const roleClaimer = {
    run: wrap((creep: Claimer) => {
        if (creep.spawning) {
            return
        }

        const targetRoom = Game.rooms[creep.memory.roomName]
        if (!targetRoom || !targetRoom.controller) {
            Logger.info('claimer:no-controller', creep.name)
            return
        }
        if (targetRoom.controller.my) {
            Logger.info('claimer:room-is-mine', creep.name, targetRoom.name)
            clearConstructionSites(targetRoom)
            creep.suicide()
            return
        }
        if (targetRoom.controller?.safeMode) {
            return
        }

        if (creep.memory.roomName !== creep.room.name) {
            moveToRoom(creep, creep.memory.roomName)
        }

        let err
        if (targetRoom.controller.owner || targetRoom.controller.reservation) {
            err = creep.attackController(targetRoom.controller)
            if (err === ERR_NOT_IN_RANGE) {
                moveTo(creep, { pos: targetRoom.controller.pos, range: 1 })
            } else if (!includes([OK, ERR_TIRED], err)) {
                Logger.warning('claimer:attack:failed', creep.name, err)
            }
        } else if (creep.memory.attack) {
            err = creep.reserveController(targetRoom.controller)
            if (err === ERR_NOT_IN_RANGE) {
                moveTo(creep, { pos: targetRoom.controller.pos, range: 1 })
            } else if (err !== OK) {
                Logger.warning('claimer:reservation:failed', creep.name, err)
            }
        } else {
            err = creep.claimController(targetRoom.controller)
            if (err === ERR_NOT_IN_RANGE) {
                err = moveTo(creep, { pos: targetRoom.controller.pos, range: 1 })
            } else if (err !== OK) {
                Logger.warning('claimer:claim:failed', creep.name, err)
            }
        }
    }, 'runClaimer'),

    canCreate(spawn: StructureSpawn): boolean {
        const energyAvailable = spawn.room.energyAvailable
        const parts = calculateParts(energyAvailable)
        return parts !== null
    },

    create(spawn: StructureSpawn, roomName: string, opts?: CreateOptions): number {
        const energyAvailable = spawn.room.energyAvailable
        let parts = calculateParts(energyAvailable)
        if (parts === null || parts.length === 0) {
            Logger.warning('claimer:create:failed', spawn.room.name, parts, energyAvailable)
        }
        if (opts?.minimal) {
            parts = [CLAIM, MOVE]
        }
        const memory = {
            role: ROLE,
            home: spawn.room.name,
            roomName,
        } as ClaimerMemory
        if (opts?.attack) {
            memory.attack = true
        }

        const err = spawn.spawnCreep(parts as BodyPartConstant[], `${ROLE}:${autoIncrement()}`, {
            memory,
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
