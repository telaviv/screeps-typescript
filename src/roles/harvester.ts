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
        const roomMemory = Memory.rooms[creep.room.name]
        const sourceMemory = roomMemory.sources.find(
            s => s.id === creep.memory.source,
        )
        if (!sourceMemory) {
            throw Error(`source memory isn't real ${roomMemory.sources}`)
        }
        const source = Game.getObjectById(sourceMemory.id) as Source
        if (creep.harvest(source) === ERR_NOT_IN_RANGE) {
            creep.moveTo(sourceMemory.harvest, {
                visualizePathStyle: { stroke: '#ffaa00' },
            })
        }
    },

    getSourceCounts(room: Room): SourceCounts {
        const counts: SourceCounts = {}
        for (const source of room.memory.sources) {
            counts[source.id] = 0
        }
        for (const creep of Object.values(Memory.creeps)) {
            if (creep.role === 'harvester') {
                const harvesterMemory = creep as HarvesterMemory
                counts[harvesterMemory.source] += 1
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
        return spawn.spawnCreep(
            [WORK, WORK, MOVE, MOVE],
            `${role}:${Game.time}`,
            {
                memory: {
                    role,
                    source: this.getNextSource(spawn.room),
                } as HarvesterMemory,
            },
        )
    },
}

export default roleHarvester
