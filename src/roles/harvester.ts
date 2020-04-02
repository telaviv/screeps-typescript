import { wrap } from 'utils/profiling'

const ROLE = 'harvester'

export interface Harvester extends SourceCreep {
    memory: HarvesterMemory
}

interface HarvesterMemory extends SourceMemory {
    role: 'harvester'
}

const roleHarvester = {
    run: wrap((creep: Harvester) => {
        const roomMemory = Memory.rooms[creep.room.name]
        const sourceMemory = roomMemory.sources.find(
            s => s.id === creep.memory.source,
        )
        if (!sourceMemory) {
            throw Error(`source memory isn't real ${roomMemory.sources}`)
        }
        const source = Game.getObjectById(sourceMemory.id) as Source

        if (creep.harvest(source) === ERR_NOT_IN_RANGE) {
            const harvestPos = sourceMemory.dropSpot.pos
            creep.moveTo(harvestPos.x, harvestPos.y, {
                visualizePathStyle: { stroke: '#ffaa00' },
            })
        }
    }, 'runHarvester'),

    create(spawn: StructureSpawn, source: Id<Source>): number {
        const capacity = spawn.room.energyCapacityAvailable
        return spawn.spawnCreep(
            calculateParts(capacity),
            `${ROLE}:${Game.time}`,
            {
                memory: {
                    role: ROLE,
                    source,
                } as HarvesterMemory,
            },
        )
    },
}

export function calculateParts(capacity: number): BodyPartConstant[] {
    const chunkCost = BODYPART_COST[WORK] + BODYPART_COST[MOVE]
    let capacityLeft = Math.min(capacity, 5 * chunkCost)
    let parts: BodyPartConstant[] = []
    while (capacityLeft >= chunkCost) {
        parts = parts.concat([WORK, MOVE])
        capacityLeft -= chunkCost
    }
    return parts
}

export default roleHarvester
