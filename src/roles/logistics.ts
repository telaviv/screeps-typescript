import { minBy } from 'utils/lodash'
import { StrategyPhase } from 'strategy'

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
            const roomMemory = Memory.rooms[creep.room.name]
            const sourceMemory = roomMemory.sources.find(
                s => s.id === creep.memory.source,
            )
            if (!sourceMemory) {
                throw Error("somehow we don't have memory")
            }

            const source = Game.getObjectById(creep.memory.source) as Source
            const target = creep.pos.findClosestByRange(
                FIND_DROPPED_RESOURCES,
                {
                    filter: {
                        resourceType: RESOURCE_ENERGY,
                    },
                },
            )

            if (
                roomMemory.strategy === StrategyPhase.DropMining &&
                target !== null
            ) {
                if (target === null) {
                    console.log('found no dropped resources')
                    return
                }

                const err = creep.pickup(target)
                if (err === ERR_NOT_IN_RANGE) {
                    const harvest = sourceMemory.harvest
                    creep.moveTo(harvest.x, harvest.y, {
                        visualizePathStyle: { stroke: '#ffaa00' },
                        range: 1,
                    })
                }
            } else if (creep.harvest(source) === ERR_NOT_IN_RANGE) {
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
