import { minBy } from 'utils/lodash'
import { getNextSource, harvestEnergy, pickupEnergy } from 'utils'
import { StrategyPhase } from 'strategy'

const ROLE = 'logistics'

export interface Logistics extends SourceCreep {
    memory: LogisticsMemory
}

interface LogisticsMemory extends SourceMemory {
    role: 'logistics'
}

const roleLogistics = {
    run(creep: Logistics) {
        if (creep.carry.energy < creep.carryCapacity) {
            const roomMemory = Memory.rooms[creep.room.name]
            if (roomMemory.strategy === StrategyPhase.DropMining) {
                pickupEnergy(creep)
            } else {
                harvestEnergy(creep)
            }
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
            }
        }
    },

    getSourceMemory(creep: Logistics) {
        const roomMemory = Memory.rooms[creep.room.name]
        const sourceMemory = roomMemory.sources.find(
            s => s.id === creep.memory.source,
        )
        if (!sourceMemory) {
            throw Error("Somehow we don't have memory")
        }

        return sourceMemory
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
        return spawn.spawnCreep([WORK, CARRY, MOVE], `${ROLE}:${Game.time}`, {
            memory: {
                role: ROLE,
                source: getNextSource(spawn.room, ROLE),
            } as LogisticsMemory,
        })
    },
}

export default roleLogistics
