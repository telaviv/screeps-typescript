import {
    getNextSource,
    getEnergy,
    isFullOfEnergy,
    hasNoEnergy,
} from 'utils/energy-harvesting'
import { wrap } from 'utils/profiling'

import roleBuilder from './builder'

export const TASK_HAULING = 'hauling'
export const TASK_COLLECTING = 'collecting'

type DeliveryTask = typeof TASK_HAULING
type Task = DeliveryTask | typeof TASK_COLLECTING

export interface Logistics extends SourceCreep {
    memory: LogisticsMemory
}

interface LogisticsMemory extends SourceMemory {
    role: 'logistics'
    preference: DeliveryTask
    currentTask: Task
}

const ROLE = 'logistics'

const roleLogistics = {
    run: wrap((creep: Logistics) => {
        roleLogistics.updateMemory(creep)
        const currentTask = creep.memory.currentTask

        if (currentTask === TASK_COLLECTING) {
            getEnergy(creep)
        } else if (currentTask === TASK_HAULING) {
            roleLogistics.haulEnergy(creep)
        }
    }, 'runLogistics'),

    updateMemory(creep: Logistics) {
        const memory = creep.memory
        const currentTask = memory.currentTask
        if (currentTask === TASK_COLLECTING && isFullOfEnergy(creep)) {
            memory.currentTask = memory.preference
        } else if (currentTask !== TASK_COLLECTING && hasNoEnergy(creep)) {
            memory.currentTask = TASK_COLLECTING
        }
    },

    haulEnergy(creep: Logistics) {
        const targets = creep.room.find(FIND_STRUCTURES, {
            filter: roleLogistics.needsEnergy,
        })
        if (targets.length > 0) {
            if (
                creep.transfer(targets[0], RESOURCE_ENERGY) === ERR_NOT_IN_RANGE
            ) {
                creep.moveTo(targets[0], {
                    visualizePathStyle: { stroke: '#ffffff' },
                })
            }
        } else {
            roleBuilder.run(creep)
        }
    },

    needsEnergy(structure: Structure): boolean {
        if (
            structure.structureType === STRUCTURE_EXTENSION ||
            structure.structureType === STRUCTURE_SPAWN ||
            structure.structureType === STRUCTURE_TOWER
        ) {
            const s = structure as
                | StructureExtension
                | StructureSpawn
                | StructureTower
            return s.energy < s.energyCapacity
        }
        return false
    },

    create(spawn: StructureSpawn): number {
        return spawn.spawnCreep(
            [WORK, CARRY, MOVE, MOVE],
            `${ROLE}:${Game.time}`,
            {
                memory: {
                    role: ROLE,
                    source: getNextSource(spawn.room, ROLE),
                    preference: TASK_HAULING,
                    currentTask: TASK_COLLECTING,
                } as LogisticsMemory,
            },
        )
    },
}

export default roleLogistics
