import includes from 'lodash/includes'

import { fromBodyPlan, byPartCount, planCost } from 'utils/parts'
import { profile } from 'utils/profiling'
import * as Logger from 'utils/logger'
import { spawnCreep } from 'utils/spawn'

const ROLE = 'harvester'

const BODY_PLANS = [
    byPartCount({ [MOVE]: 10, [WORK]: 10, [CARRY]: 16 }),
    byPartCount({ [MOVE]: 10, [WORK]: 10, [CARRY]: 8 }),
    byPartCount({ [MOVE]: 10, [WORK]: 10, [CARRY]: 4 }),
    byPartCount({ [MOVE]: 7, [WORK]: 7, [CARRY]: 2 }),
    byPartCount({ [MOVE]: 5, [WORK]: 5 }),
]

export interface Harvester extends SourceCreep {
    memory: HarvesterMemory
}

interface HarvesterMemory extends SourceMemory {
    role: 'harvester'
}

export class HarvesterCreep {
    readonly creep: Harvester

    constructor(creep: Harvester) {
        this.creep = creep
    }

    @profile
    run() {
        if (this.creep.spawning) {
            return
        }
        const sourceMemory = this.getSourceMemory()
        const source = Game.getObjectById(sourceMemory.id) as Source
        if (this.isAtHarvestPos()) {
            const err = this.creep.harvest(source)
            if (!includes([OK, ERR_NOT_ENOUGH_RESOURCES], err)) {
                Logger.warning(
                    'harvester:harvest:failure',
                    this.creep.name,
                    "couldn't harvest",
                    err,
                )
            }
        } else {
            this.moveToHarvestPos()
        }
    }

    getSourceMemory() {
        const roomMemory = Memory.rooms[this.creep.room.name]
        const sourceMemory = roomMemory.sources.find(
            s => s.id === this.creep.memory.source,
        )
        if (!sourceMemory) {
            throw Error(`source memory isn't real ${roomMemory.sources}`)
        }
        return sourceMemory
    }

    get harvestPos() {
        const sourceMemory = this.getSourceMemory()
        return sourceMemory.dropSpot.pos
    }

    isAtHarvestPos() {
        return (
            this.creep.pos.x === this.harvestPos.x &&
            this.creep.pos.y === this.harvestPos.y
        )
    }

    moveToHarvestPos() {
        this.creep.moveTo(this.harvestPos.x, this.harvestPos.y, {
            visualizePathStyle: { stroke: '#ffaa00' },
        })
    }
}

const roleHarvester = {
    run: (creep: Harvester) => {
        const harvester = new HarvesterCreep(creep)
        harvester.run()
    },

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
