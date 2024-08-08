import includes from 'lodash/includes'

import * as Logger from 'utils/logger'
import autoIncrement from 'utils/autoincrement'
import { fromBodyPlanSafe } from 'utils/parts'
import { moveToSafe } from 'utils/travel'
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
            creep.suicide()
            return
        }
        if (targetRoom.controller?.safeMode) {
            return
        }
        let err
        if (targetRoom.controller.owner || targetRoom.controller.reservation) {
            err = creep.attackController(targetRoom.controller)
            if (err === ERR_NOT_IN_RANGE) {
                moveToSafe(creep, targetRoom.controller.pos)
            } else if (!includes([OK, ERR_TIRED], err)) {
                Logger.warning('claimer:attack:failed', creep.name, err)
            }
        } else if (creep.memory.attack) {
            err = creep.reserveController(targetRoom.controller)
            if (err === ERR_NOT_IN_RANGE) {
                moveToSafe(creep, targetRoom.controller.pos)
            } else if (err !== OK) {
                Logger.warning('claimer:reservation:failed', creep.name, err)
            }
        } else {
            err = creep.claimController(targetRoom.controller)
            if (err === ERR_NOT_IN_RANGE) {
                err = moveToSafe(creep, targetRoom.controller.pos)
                console.log('move to safe', creep.name, err)
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
