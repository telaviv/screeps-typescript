import { minBy } from 'utils/lodash'

interface SourceCounts {
    [index: string]: number
}

export interface Harvester extends Creep {
    memory: HarvesterMemory
}

interface HarvesterMemory extends CreepMemory {
    role: 'harvester'
    source: string
}

const roleHarvester = {
    run(creep: Harvester) {
        if (creep.carry.energy < creep.carryCapacity) {
            const sources = creep.room.find(FIND_SOURCES)
            if (creep.harvest(sources[0]) === ERR_NOT_IN_RANGE) {
                creep.moveTo(sources[0], {
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
            if (!counts.hasOwnProperty(source.id)) {
                counts[source.id] = 1
            } else {
                counts[source.id] += 1
            }
        }
        return counts
    },

    getNextSource(room: Room): string {
        const sourceCounts = this.getSourceCounts(room)
        return minBy(Object.keys(sourceCounts), id => sourceCounts[id])
    },

    create(spawn: StructureSpawn): number {
        const role = 'harvester'
        return spawn.spawnCreep([WORK, CARRY, MOVE], `${role}:${Game.time}`, {
            memory: {
                role,
                source: this.getNextSource(spawn.room),
            } as HarvesterMemory,
        })
    },
}

export default roleHarvester
