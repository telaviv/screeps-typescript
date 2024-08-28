import includes from 'lodash/includes'

import * as Logger from 'utils/logger'
import { moveTo, moveToRoom, moveWithinRoom } from 'utils/travel'
import autoIncrement from 'utils/autoincrement'
import { clearConstructionSites } from 'utils/room'
import { fromBodyPlanSafe } from 'utils/parts'
import { wrap } from 'utils/profiling'

const ROLE = 'claimer'

export interface Claimer extends Creep {
    memory: ClaimerMemory
}

export interface ClaimerMemory extends CreepMemory {
    role: 'claimer'
    roomName: string
    attack?: boolean
    reserve?: boolean
}

interface CreateOptions {
    capacity?: number
    minimal?: boolean
    attack?: boolean
    reserve?: boolean
}

const roleClaimer = {
    run: wrap((creep: Claimer) => {
        if (creep.spawning) {
            return
        }

        const targetRoom = Game.rooms[creep.memory.roomName]
        if (targetRoom && !targetRoom.controller) {
            Logger.info('claimer:no-controller', creep.name)
            return
        }

        if (!targetRoom) {
            moveToRoom(creep, creep.memory.roomName)
            return
        }

        if (!targetRoom.controller) {
            Logger.error('claimer:no-controller', creep.name, targetRoom.name)
            return
        }

        if (targetRoom.controller.my) {
            Logger.info('claimer:room-is-mine', creep.name, targetRoom.name)
            clearConstructionSites(targetRoom)
            for (const structure of targetRoom.find(FIND_STRUCTURES)) {
                structure.destroy()
            }
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
        if (
            targetRoom.controller.owner ||
            (targetRoom.controller.reservation &&
                targetRoom.controller.reservation.username !== global.USERNAME)
        ) {
            err = creep.attackController(targetRoom.controller)
            if (err === ERR_NOT_IN_RANGE) {
                moveWithinRoom(creep, { pos: targetRoom.controller.pos, range: 1 })
            } else if (!includes([OK, ERR_TIRED], err)) {
                Logger.warning('claimer:attack:failed', creep.name, err)
            }
        } else if (creep.memory.attack) {
            err = creep.reserveController(targetRoom.controller)
            if (err === ERR_NOT_IN_RANGE) {
                moveWithinRoom(creep, { pos: targetRoom.controller.pos, range: 1 })
            } else if (err !== OK) {
                Logger.warning('claimer:reservation:failed', creep.name, err)
            }
        } else if (creep.memory.reserve) {
            err = creep.reserveController(targetRoom.controller)
            if (err === ERR_NOT_IN_RANGE) {
                moveWithinRoom(creep, { pos: targetRoom.controller.pos, range: 1 })
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
        const capacity = opts?.capacity ?? spawn.room.energyAvailable
        let parts = calculateParts(capacity)
        if (parts === null || parts.length === 0) {
            return ERR_NOT_ENOUGH_ENERGY
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
        if (opts?.reserve) {
            memory.reserve = true
        }

        const err = spawn.spawnCreep(parts, `${ROLE}:${autoIncrement()}`, {
            memory,
        })
        return err
    },
}

export function calculateParts(capacity: number): BodyPartConstant[] | null {
    return fromBodyPlanSafe(capacity, [CLAIM, MOVE])
}

export default roleClaimer
