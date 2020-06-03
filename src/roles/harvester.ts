import includes from 'lodash/includes'

import { fromBodyPlan, byPartCount, planCost } from 'utils/parts'
import { wrap } from 'utils/profiling'
import * as Logger from 'utils/logger'
import { spawnCreep } from 'utils/spawn'

const ROLE = 'harvester'

export interface Harvester extends SourceCreep {
    memory: HarvesterMemory
}

interface HarvesterMemory extends SourceMemory {
    role: 'harvester'
}

const BODY_PLANS = [
    byPartCount({ [MOVE]: 10, [WORK]: 10, [CARRY]: 6 }),
    byPartCount({ [MOVE]: 5, [WORK]: 5, [CARRY]: 2 }),
]

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
        const capacity = rescue
            ? Math.max(300, spawn.room.energyAvailable)
            : spawn.room.energyCapacityAvailable
        const parts = calculateParts(capacity)
        const err = spawnCreep(spawn, parts, ROLE, spawn.room.name, {
            memory: {
                role: ROLE,
                home: spawn.room.name,
                waitTime: 0,
                tasks: [],
                source,
            } as HarvesterMemory,
        })
        return err
    },
}

export function calculateParts(capacity: number): BodyPartConstant[] {
    for (const plan of BODY_PLANS) {
        if (planCost(plan) <= capacity) {
            return plan
        }
    }
    return fromBodyPlan(capacity, [WORK, MOVE])
}

export default roleHarvester
