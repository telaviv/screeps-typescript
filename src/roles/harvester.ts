import includes from 'lodash/includes'

import { byPartCount, fromBodyPlan, planCost } from 'utils/parts'
import { profile, wrap } from 'utils/profiling'
import * as Logger from 'utils/logger'
import { spawnCreep } from 'utils/spawn'
import { isFullOfEnergy } from 'utils/energy-harvesting'
import { FlatRoomPosition, SourceCreep, SourceMemory } from 'types'
import { moveTo } from 'utils/creep'

const MAX_WORK_PARTS = 5

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
    public run(): void {
        if (this.creep.spawning) {
            return
        }

        if (this.canTransferEnergy()) {
            this.transferEnergyToLink()
            return
        }

        this.harvestSource()
    }

    get harvestPos(): RoomPosition {
        return new RoomPosition(this.creep.memory.pos.x, this.creep.memory.pos.y, this.creep.memory.pos.roomName)
    }

    get room(): Room {
        return this.creep.room
    }

    get source(): Source {
        return Game.getObjectById(this.creep.memory.source)!
    }

    private isHarvestTick(): boolean {
        const workParts = this.creep.getActiveBodyparts(WORK)
        return this.creep.ticksToLive! % (workParts / MAX_WORK_PARTS) === 0 ||
            this.source.energy === 0
    }

    private isAtHarvestPos(): boolean {
        return (
            this.creep.pos.x === this.harvestPos.x &&
            this.creep.pos.y === this.harvestPos.y &&
            this.creep.pos.roomName === this.harvestPos.roomName
        )
    }

    private moveToHarvestPos(): void {
        const err = moveTo(this.harvestPos, this.creep)
        if (err !== OK && err !== ERR_TIRED) {
            Logger.error('harvester:moveToHarvestPos:failure', this.creep.name, this.harvestPos, err)
        }
    }

    private harvestSource(): void {
        const err = this.creep.harvest(this.source)
        if (err === ERR_NOT_IN_RANGE) {
            this.moveToHarvestPos()
        } else if (err !== OK && err !== ERR_NOT_ENOUGH_RESOURCES) {
            Logger.warning(
                'harvester:harvest:failure',
                this.creep.name,
                "couldn't harvest",
                err,
            )
        }
    }

    private canTransferEnergy(): boolean {
        if (this.creep.getActiveBodyparts(CARRY) === 0 ||
            !this.isFullOfEnergy() ||
            this.isHarvestTick()) {
            return false
        }

        const link = this.getLink()
        if (link === null) {
            return false
        }
        return link.store.getFreeCapacity(RESOURCE_ENERGY) > 0
    }

    private transferEnergyToLink(): void {
        const err = this.creep.transfer(this.getLink()!, RESOURCE_ENERGY)
        if (err !== OK) {
            Logger.error(
                'harvester:transfer:failure',
                this.creep.name,
                "couldn't transfer energy",
                err,
            )
        }
    }

    private isFullOfEnergy(): boolean {
        return isFullOfEnergy(this.creep)
    }

    private getLink(): StructureLink | null {
        const link = this.creep.pos.findClosestByRange(FIND_STRUCTURES, {
            filter: s => s.structureType === STRUCTURE_LINK,
        }) as StructureLink | null
        if (link === null) {
            return null
        }
        if (link.pos.inRangeTo(this.harvestPos, 1)) {
            return link
        }
        return null
    }

    private hasLink(): boolean {
        return this.getLink() !== null
    }
}

const roleHarvester = {
    run: wrap((creep: Harvester) => {
        const harvester = new HarvesterCreep(creep)
        harvester.run()
    }, 'harvester:run'),

    create(spawn: StructureSpawn, sourceId: Id<Source>, pos: RoomPosition | null = null, rescue = false): number {
        const source = Game.getObjectById(sourceId)
        if (!source) {
            Logger.error('harvester:create:source:not-found', sourceId)
            return ERR_NOT_FOUND
        }
        const stationaryPosition = pos === null ? source.room.memory.stationaryPoints!.sources[sourceId] : pos
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
                pos: { x: stationaryPosition.x, y: stationaryPosition.y, roomName: source.room.name },
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
