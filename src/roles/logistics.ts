import { getNextSource, getEnergy } from 'utils/energy-harvesting'

export interface Logistics extends SourceCreep {
    memory: LogisticsMemory
}

interface LogisticsMemory extends SourceMemory {
    role: 'logistics'
}

const ROLE = 'logistics'

const roleLogistics = {
    run(creep: Logistics) {
        if (creep.store.getFreeCapacity(RESOURCE_ENERGY) > 0) {
            getEnergy(creep)
        } else {
            const targets = creep.room.find(FIND_STRUCTURES, {
                filter: this.isToBeFilled,
            })
            if (targets.length > 0) {
                if (
                    creep.transfer(targets[0], RESOURCE_ENERGY) ===
                    ERR_NOT_IN_RANGE
                ) {
                    creep.moveTo(targets[0], {
                        visualizePathStyle: { stroke: '#ffffff' },
                    })
                }
            } else {
                creep.say('no 🎯')
            }
        }
    },

    isToBeFilled(structure: Structure): boolean {
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
                } as LogisticsMemory,
            },
        )
    },
}

export default roleLogistics
