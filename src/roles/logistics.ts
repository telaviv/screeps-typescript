import { minBy } from 'utils/lodash'

interface SourceCounts {
    [index: string]: number
}

export interface Logistics extends Creep {
    memory: LogisticsMemory
}

interface LogisticsMemory extends CreepMemory {
    role: 'logistics'
    source: string
}

const roleLogistics = {
    run(creep: Logistics) {
        if (creep.carry.energy < creep.carryCapacity) {
            const source = Game.getObjectById(creep.memory.source) as Source
            if (creep.harvest(source) === ERR_NOT_IN_RANGE) {
                creep.moveTo(source, {
                    visualizePathStyle: { stroke: '#ffaa00' },
                })
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

    getSourceCounts(room: Room): SourceCounts {
        const counts: SourceCounts = {}
        for (const source of room.memory.sources) {
            counts[source.id] = 0
        }
        for (const creep of Object.values(Memory.creeps)) {
            if (creep.role === 'logistics') {
                const logisticsMemory = creep as LogisticsMemory
                counts[logisticsMemory.source] += 1
            }
        }
        return counts
    },

    getNextSource(room: Room): string {
        const sourceCounts = this.getSourceCounts(room)
        return minBy(Object.keys(sourceCounts), id => sourceCounts[id])
    },

    create(spawn: StructureSpawn): number {
        const role = 'logistics'
        return spawn.spawnCreep([WORK, CARRY, MOVE], `${role}:${Game.time}`, {
            memory: {
                role,
                source: this.getNextSource(spawn.room),
            } as LogisticsMemory,
        })
    },
}

export default roleLogistics
