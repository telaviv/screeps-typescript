import includes from 'lodash/includes'
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
            if (!includes([OK, ERR_NOT_ENOUGH_RESOURCES], err)) {
                Logger.warning(
                    'harvester:harvest:failure',
                    creep.name,
                    "couldn't harvest",
                    err,
                )
            }
        } else {
            creep.moveTo(harvestPos.x, harvestPos.y, {
                visualizePathStyle: { stroke: '#ffaa00' },
            })
        }
    }, 'runHarvester'),

    create(spawn: StructureSpawn, source: Id<Source>, rescue = false): number {
        const capacity = spawn.room.energyCapacityAvailable
        const workParts = rescue ? 5 : 8
        const parts = calculateParts(capacity, workParts)
        const err = spawn.spawnCreep(parts, `${ROLE}:${Game.time}`, {
            memory: {
                role: ROLE,
                source,
            } as HarvesterMemory,
        })
        return err
    },
}

export function calculateParts(
    capacity: number,
    workParts: number,
): BodyPartConstant[] {
    const chunkCost = BODYPART_COST[WORK] + BODYPART_COST[MOVE]
    let capacityLeft = Math.min(capacity, workParts * chunkCost)
    let parts: BodyPartConstant[] = []
    while (capacityLeft >= chunkCost) {
        parts = parts.concat([WORK, MOVE])
        capacityLeft -= chunkCost
    }
    return parts
}

export default roleHarvester
