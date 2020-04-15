import { wrap } from 'utils/profiling'
import * as Logger from 'utils/logger'

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
        const harvestPos = sourceMemory.dropSpot.pos
        if (creep.pos.x === harvestPos.x && creep.pos.y === harvestPos.y) {
            const err = creep.harvest(source)
            if (err !== OK) {
                Logger.warning(
                    'harvester:harvest:failure',
                    creep.name,
                    "couldn't harvest",
                )
            }
        } else {
            creep.moveTo(harvestPos.x, harvestPos.y, {
                visualizePathStyle: { stroke: '#ffaa00' },
            })
        }
    }, 'runHarvester'),

    create(spawn: StructureSpawn, source: Id<Source>): number {
        const capacity = spawn.room.energyCapacityAvailable
        const parts = calculateParts(capacity)
        const err = spawn.spawnCreep(parts, `${ROLE}:${Game.time}`, {
            memory: {
                role: ROLE,
                source,
            } as HarvesterMemory,
        })
        return err
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
