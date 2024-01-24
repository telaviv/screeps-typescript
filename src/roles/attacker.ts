import { wrap } from 'utils/profiling'
import * as Logger from 'utils/logger'
import { fromBodyPlan } from 'utils/parts'
import WarDepartment, { WarStatus } from 'war-department'

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
        if (creep.room.name !== creep.memory.roomName) {
            creep.moveTo(new RoomPosition(25, 25, creep.memory.roomName), {
                range: 23,
                visualizePathStyle: { stroke: '#ffaa00' },
            })
            return
        }

        if (!creep.room.controller) {
            Logger.warning('attacker:no-controller', creep.name)
            return
        }

        if (creep.room.controller.safeMode) {
            Logger.warning(
                'attacker:safeMode',
                creep.name,
                creep.room.name,
                creep.room.controller.safeMode,
            )
            return
        }

        const structures = creep.room.find(FIND_HOSTILE_STRUCTURES, {
            filter: (structure) => structure.structureType === 'invaderCore',
        })

        const hostiles = creep.room.find(FIND_HOSTILE_CREEPS);

        if (structures.length === 0 && hostiles.length === 0) {
            const warDepartment = WarDepartment.create(creep.memory.home)
            if (warDepartment.status === WarStatus.ATTACK) {
                warDepartment.status = WarStatus.CLAIM
            }

            creep.suicide()
        }

        if (hostiles.length > 0) {
            const hostile = hostiles[0];
            const err = creep.attack(hostile);
            if (err === ERR_NOT_IN_RANGE) {
                creep.moveTo(hostile, {
                    visualizePathStyle: { stroke: '#ffaa00' },
                })
            }
            return
        }

        const structure = structures[0]
        const err = creep.attack(structure)
        if (err === ERR_NOT_IN_RANGE) {
            creep.moveTo(structure, {
                visualizePathStyle: { stroke: '#ffaa00' },
            })
        } else if (err !== OK) {
            Logger.warning(
                'attacker:dismantle:failed',
                creep.name,
                creep.pos,
                creep.room.name,
                structure,
                err,
            )
        }
    }, 'runAttacker'),

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
                } as AttackerMemory,
            },
        )
    },
}

export function calculateParts(capacity: number): BodyPartConstant[] {
    return fromBodyPlan(capacity, [RANGED_ATTACK, MOVE])
}

export default roleAttacker
