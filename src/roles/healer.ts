import * as Logger from 'utils/logger'
import { followCreep, moveToRoom } from 'utils/travel'
import { Attacker } from './attacker'
import { getCreeps, wander } from 'utils/creep'
import { fromBodyPlan } from 'utils/parts'
import { getInjuredCreeps } from 'utils/room'
import { wrap } from 'utils/profiling'

const ROLE = 'healer'

export interface Healer extends Creep {
    memory: HealerMemory
}

export interface HealerMemory extends CreepMemory {
    role: 'healer'
    roomName: string
    home: string
    asPair?: true | Id<Creep>
}

const roleHealer = {
    run: wrap((creep: Healer) => {
        if (creep.spawning) {
            return
        }

        if (creep.memory.asPair === true) {
            const attackers = getCreeps('attack', creep.room) as Attacker[]
            const pair = attackers.find((a) => a.memory.asPair === true)
            if (pair !== undefined) {
                pair.memory.asPair = creep.id
                creep.memory.asPair = pair.id
            } else {
                wander(creep)
                return
            }
        } else if (creep.memory.asPair !== undefined) {
            const partner = Game.getObjectById(creep.memory.asPair)
            if (!partner) {
                Logger.info('healer:run:partner-not-found', creep.name, creep.memory.asPair)
                return
            }
            roleHealer.pairHeal(creep)
            if (creep.room.name !== partner.room.name) {
                moveToRoom(creep, partner.room.name)
                return
            } else {
                followCreep(creep, partner)
            }
            return
        }

        if (creep.memory.roomName !== creep.room.name) {
            moveToRoom(creep, creep.memory.roomName)
            return
        }

        const targets = getInjuredCreeps(creep.room)
        if (targets.length === 0) {
            return
        }

        if (creep.getActiveBodyparts(HEAL) === 0) {
            return
        }

        const target = targets[0]
        followCreep(creep, target)
        const err = creep.heal(target)
        if (err !== OK && err !== ERR_NOT_IN_RANGE) {
            Logger.warning(
                'healer:heal:failed',
                creep.name,
                creep.pos,
                creep.room.name,
                target,
                err,
            )
        }
    }, 'runHealer'),

    pairHeal(creep: Healer): void {
        const partner = Game.getObjectById(creep.memory.asPair as Id<Creep>) as Creep
        if (!partner) {
            Logger.error('healer:pairHeal:partner-not-found', creep.name, creep.memory.asPair)
            return
        }
        const targets = [creep, partner].filter((c) => c.hits < c.hitsMax)
        targets.sort((a, b) => b.hitsMax - b.hits - (a.hitsMax - a.hits))
        if (targets.length === 0) {
            creep.heal(partner)
        } else {
            creep.heal(targets[0])
        }
    },

    create(
        spawn: StructureSpawn,
        roomName: string,
        large = false,
        asPair: boolean | undefined = undefined,
    ): number {
        let body: BodyPartConstant[] = [HEAL, MOVE]
        if (large) {
            body = fromBodyPlan(spawn.room.energyCapacityAvailable, [HEAL, MOVE], {
                padding: [TOUGH, MOVE],
            })
        }
        return spawn.spawnCreep(body, `${ROLE}:${Game.time}`, {
            memory: {
                role: ROLE,
                home: spawn.room.name,
                asPair,
                roomName,
            } as HealerMemory,
        })
    },
}

export default roleHealer
