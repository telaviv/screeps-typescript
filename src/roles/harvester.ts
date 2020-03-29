import { getNextSource } from 'utils/energy-harvesting'
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
            const err = creep.moveTo(harvestPos.x, harvestPos.y, {
                visualizePathStyle: { stroke: '#ffaa00' },
            })
            if (err !== OK) {
                console.log(
                    `couldn't move to ${JSON.stringify(harvestPos)}: ${err}`,
                )
            }
        }
    }, 'runHarvester'),

    create(spawn: StructureSpawn): number {
        return spawn.spawnCreep(
            [WORK, WORK, MOVE, MOVE],
            `${ROLE}:${Game.time}`,
            {
                memory: {
                    role: ROLE,
                    source: getNextSource(spawn.room, ROLE),
                } as HarvesterMemory,
            },
        )
    },
}

export default roleHarvester
