import includes from 'lodash/includes'

import { byPartCount, fromBodyPlan, planCost } from 'utils/parts'
import { profile } from 'utils/profiling'
import * as Logger from 'utils/logger'
import { spawnCreep } from 'utils/spawn'
import { isFullOfEnergy } from 'utils/energy-harvesting'
import { FlatRoomPosition, SourceCreep, SourceMemory } from 'types'

const ROLE = 'harvester'

const BODY_PLANS = [
    byPartCount({ [MOVE]: 10, [WORK]: 10, [CARRY]: 8 }),
    byPartCount({ [MOVE]: 10, [WORK]: 10, [CARRY]: 4 }),
    byPartCount({ [MOVE]: 8, [WORK]: 8, [CARRY]: 2 }),
    byPartCount({ [MOVE]: 7, [WORK]: 7, [CARRY]: 2 }),
    byPartCount({ [MOVE]: 5, [WORK]: 5 }),
]

export interface Harvester extends SourceCreep {
    memory: HarvesterMemory
}

interface HarvesterMemory extends SourceMemory {
    role: 'harvester'
    pos: FlatRoomPosition
}

export function isHarvester(creep: Creep): creep is Harvester {
    return creep.memory.role === ROLE
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

        if (this.canTransferEnergy()) {
            this.transferEnergyToLink()
            return
        }

        if (!this.isAtHarvestPos()) {
            this.moveToHarvestPos()
            return
        }

        this.harvestSource()
    }

    get harvestPos(): RoomPosition {
        return new RoomPosition(this.creep.memory.pos.x, this.creep.memory.pos.y, this.creep.memory.pos.roomName)
    }

    get room() {
        return this.creep.room
    }

    private isAtHarvestPos() {
        return (
            this.creep.pos.x === this.harvestPos.x &&
            this.creep.pos.y === this.harvestPos.y
        )
    }

    private moveToHarvestPos() {
        this.creep.moveTo(this.harvestPos.x, this.harvestPos.y, {
            visualizePathStyle: { stroke: '#ffaa00' },
        })
    }

    private harvestSource() {
        const source = Game.getObjectById(this.creep.memory.source)!
        const err = this.creep.harvest(source)
        if (!includes([OK, ERR_NOT_ENOUGH_RESOURCES], err)) {
            Logger.warning(
                'harvester:harvest:failure',
                this.creep.name,
                "couldn't harvest",
                err,
            )
        }
    }

    canTransferEnergy() {
        return (
            this.creep.getActiveBodyparts(CARRY) > 5 &&
            this.hasLink() &&
            this.linkHasCapacity() &&
            this.isFullOfEnergy()
        )
    }

    transferEnergyToLink() {
        this.creep.transfer(this.getLink()!, RESOURCE_ENERGY)
    }

    isFullOfEnergy() {
        return isFullOfEnergy(this.creep)
    }

    linkHasCapacity() {
        const link = this.getLink()!
        return link.store.getFreeCapacity(RESOURCE_ENERGY) > 0
    }

    getLink() {
        const linkPos =
            this.room.memory.plan.links.sources[this.creep.memory.source]

        const links = this.room
            .lookForAt<LOOK_STRUCTURES>(LOOK_STRUCTURES, linkPos.x, linkPos.y)
            .filter(
                (s) => s.structureType === STRUCTURE_LINK,
            ) as StructureLink[]

        if (links.length === 0) {
            return null
        }

        return links[0]
    }

    hasLink() {
        return this.getLink() !== null
    }
}

const roleHarvester = {
    run: (creep: Harvester) => {
        const harvester = new HarvesterCreep(creep)
        harvester.run()
    },

    create(spawn: StructureSpawn, sourceId: Id<Source>, rescue = false): number {
        const source = Game.getObjectById(sourceId)
        if (!source) {
            Logger.error('harvester:create:source:not-found', sourceId)
            return ERR_NOT_FOUND
        }
        const pos = source.room.memory.stationaryPoints.sources[sourceId]
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
                pos: { x: pos.x, y: pos.y, roomName: spawn.room.name },
                source: sourceId,
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
