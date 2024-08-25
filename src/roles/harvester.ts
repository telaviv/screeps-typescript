/* eslint-disable import/no-named-as-default-member */

import * as Logger from 'utils/logger'
import { FlatRoomPosition, SourceMemory } from 'types'
import PickupRunner, { addPickupTask } from 'tasks/pickup'
import WithdrawRunner, { addWithdrawTask } from 'tasks/withdraw'
import { byPartCount, fromBodyPlan, planCost } from 'utils/parts'
import { hasNoEnergy, isFullOfEnergy } from 'utils/energy-harvesting'
import { ResourceCreep } from 'tasks/types'
import { getContainerAt } from 'utils/room-position'
import { getStationaryPoints } from 'construction-features'
import { isPickupTask } from 'tasks/pickup/utils'
import { isWithdrawTask } from 'tasks/withdraw/utils'
import { moveToRoom } from 'utils/travel'
import { moveToStationaryPoint } from 'utils/creep'
import { profile } from 'utils/profiling'
import { spawnCreep } from 'utils/spawn'

const MAX_WORK_PARTS = 5

const ROLE = 'harvester'

const BODY_PLANS = [
    { [MOVE]: 11, [WORK]: 11, [CARRY]: 1 },
    { [MOVE]: 10, [WORK]: 10, [CARRY]: 1 },
    { [MOVE]: 9, [WORK]: 9, [CARRY]: 1 },
    { [MOVE]: 8, [WORK]: 8, [CARRY]: 1 },
    { [MOVE]: 7, [WORK]: 7, [CARRY]: 1 },
    { [MOVE]: 6, [WORK]: 6, [CARRY]: 1 },
    { [MOVE]: 6, [WORK]: 6 },
    { [MOVE]: 5, [WORK]: 5 },
]

export interface Harvester extends ResourceCreep {
    memory: HarvesterMemory
}

interface HarvesterMemory extends SourceMemory {
    role: 'harvester'
    pos: FlatRoomPosition
    idleTimestamp: number
}

export function isHarvester(creep: Creep): creep is Harvester {
    return creep.memory.role === ROLE
}

export class HarvesterCreep {
    readonly creep: Harvester

    constructor(creep: Harvester) {
        this.creep = creep
    }

    get container(): StructureContainer | null {
        return getContainerAt(this.harvestPos)
    }

    @profile
    public run(): void {
        if (this.creep.spawning) {
            return
        }
        if (this.creep.memory.tasks.length > 1) {
            Logger.error('harvester:run:tasks:too-many', this.creep.name, this.creep.memory.tasks)
            this.creep.memory.tasks = []
        }

        if (!this.isAtHarvestPos()) {
            this.moveToHarvestPos()
            return
        }

        if (this.canRepairContainer()) {
            this.repairContainer()
        }

        if (this.isHarvestTick()) {
            this.harvestSource()
        }

        if (this.canTransferEnergy()) {
            this.transferEnergyToLink()
            return
        }
        if (this.creep.getActiveBodyparts(CARRY) === 0 || this.isFullOfEnergy()) {
            return
        }
        this.collectNonSourceEnergy()
        if (this.creep.memory.tasks && this.creep.memory.tasks.length > 0) {
            const task = this.creep.memory.tasks[0]
            if (isPickupTask(task)) {
                PickupRunner.run(task, this.creep)
            } else if (isWithdrawTask(task)) {
                WithdrawRunner.run(task, this.creep)
            }
        }
    }

    get harvestPos(): RoomPosition {
        return new RoomPosition(
            this.creep.memory.pos.x,
            this.creep.memory.pos.y,
            this.creep.memory.pos.roomName,
        )
    }

    get room(): Room {
        return this.creep.room
    }

    get source(): Source {
        return Game.getObjectById(this.creep.memory.source) as Source
    }

    private isHarvestTick(): boolean {
        const workParts = this.creep.getActiveBodyparts(WORK)
        const harvestPower = workParts * HARVEST_POWER
        const tickMod = Math.max(Math.floor(workParts / MAX_WORK_PARTS), 1)
        if (
            Math.floor((this.source.ticksToRegeneration - tickMod) / tickMod) * harvestPower <
            this.source.energy
        ) {
            return true
        }
        return Game.time % tickMod === 0
    }

    private isAtHarvestPos(): boolean {
        return (
            this.creep.pos.x === this.harvestPos.x &&
            this.creep.pos.y === this.harvestPos.y &&
            this.creep.pos.roomName === this.harvestPos.roomName
        )
    }

    private moveToHarvestPos(): void {
        let err
        if (this.creep.room.name !== this.harvestPos.roomName) {
            err = moveToRoom(this.creep, this.harvestPos.roomName)
        } else {
            err = moveToStationaryPoint(this.harvestPos, this.creep)
        }
        if (err !== OK && err !== ERR_TIRED) {
            Logger.error(
                'harvester:moveToHarvestPos:failure',
                this.creep.name,
                this.harvestPos,
                err,
            )
        }
    }

    private harvestSource(): void {
        if (this.creep.getActiveBodyparts(WORK) === 0) {
            Logger.info('harvester:harvest:no-work', this.creep.name)
            return
        }
        const err = this.creep.harvest(this.source)
        if (err === ERR_NOT_IN_RANGE) {
            this.moveToHarvestPos()
        } else if (err !== OK && err !== ERR_NOT_ENOUGH_RESOURCES) {
            Logger.warning('harvester:harvest:failure', this.creep.name, "couldn't harvest", err)
        }
    }

    @profile
    private canTransferEnergy(): boolean {
        if (
            this.creep.memory.tasks.length > 0 ||
            this.creep.getActiveBodyparts(CARRY) === 0 ||
            !this.isFullOfEnergy()
        ) {
            return false
        }

        const link = this.getLink()
        if (link === null) {
            return false
        }
        return link.store.getFreeCapacity(RESOURCE_ENERGY) > 0
    }

    @profile
    private transferEnergyToLink(): void {
        const link = this.getLink()
        if (link === null) {
            Logger.error('harvester:transfer:link:not-found', this.creep.name)
            return
        }
        const err = this.creep.transfer(link, RESOURCE_ENERGY)
        if (err !== OK) {
            Logger.error(
                'harvester:transfer:failure',
                this.creep.name,
                "couldn't transfer energy",
                err,
            )
        }
    }

    @profile
    private canRepairContainer(): boolean {
        if (this.creep.getActiveBodyparts(CARRY) === 0 || !this.hasEnergy()) {
            return false
        }
        const container = this.container
        if (!container) {
            return false
        }
        return (
            (container.hitsMax - container.hits) / (100 * this.creep.getActiveBodyparts(WORK)) >= 1
        )
    }

    @profile
    private collectNonSourceEnergy(): void {
        if (this.creep.memory.tasks.length === 1) {
            return
        }
        const droppedEnergy = this.creep.pos
            .lookFor(LOOK_RESOURCES)
            .find((r) => r.resourceType === RESOURCE_ENERGY)
        if (droppedEnergy) {
            const task = addPickupTask(this.creep, droppedEnergy)
            if (task !== null) {
                return
            }
        }
        const container = this.container
        if (!container) {
            return
        }
        addWithdrawTask(this.creep, container)
    }

    private repairContainer(): void {
        const container = this.container
        if (!container) {
            Logger.error('harvester:repair:container:not-found', this.creep.name)
            return
        }
        this.creep.repair(container)
    }

    private isFullOfEnergy(): boolean {
        return isFullOfEnergy(this.creep)
    }

    private hasEnergy(): boolean {
        return !hasNoEnergy(this.creep)
    }

    @profile
    private getLink(): StructureLink | null {
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
        const link = this.creep.pos.findClosestByRange(FIND_STRUCTURES, {
            filter: (s) => s.structureType === STRUCTURE_LINK,
        }) as StructureLink | null
        if (link === null) {
            return null
        }
        if (link.pos.inRangeTo(this.harvestPos, 1)) {
            return link
        }
        return null
    }
}
interface CreateOpts {
    rescue?: boolean
    capacity?: number
    roadsBuilt?: boolean
}
const roleHarvester = {
    run(creep: Harvester): void {
        const harvester = new HarvesterCreep(creep)
        harvester.run()
    },

    create(
        spawn: StructureSpawn,
        sourceId: Id<Source>,
        pos: RoomPosition | null = null,
        rescue: CreateOpts = { rescue: false, roadsBuilt: false },
    ): number {
        const source = Game.getObjectById(sourceId)
        if (!source) {
            Logger.error('harvester:create:source:not-found', sourceId)
            return ERR_NOT_FOUND
        }
        const stationaryPoints = getStationaryPoints(source.room)
        if (!stationaryPoints || !stationaryPoints.sources[sourceId]) {
            Logger.warning('harvester:create:stationary-points:not-found', sourceId)
            return ERR_NOT_FOUND
        }
        const stationaryPosition = pos === null ? stationaryPoints.sources[sourceId] : pos
        const capacity = rescue
            ? Math.max(300, spawn.room.energyAvailable)
            : spawn.room.energyCapacityAvailable
        const parts = calculateParts(capacity, rescue.roadsBuilt ?? false)
        const err = spawnCreep(spawn, parts, ROLE, spawn.room.name, {
            memory: {
                role: ROLE,
                home: spawn.room.name,
                waitTime: 0,
                tasks: [],
                pos: {
                    x: stationaryPosition.x,
                    y: stationaryPosition.y,
                    roomName: source.room.name,
                },
                source: sourceId,
                idleTimestamp: 0,
            } as HarvesterMemory,
        })
        return err
    },
}

export function calculateParts(capacity: number, roadsBuilt: boolean): BodyPartConstant[] {
    for (let plan of BODY_PLANS) {
        if (roadsBuilt) {
            plan = { ...plan, [MOVE]: Math.ceil(plan[MOVE] / 2) }
        }
        const parts = byPartCount(plan)
        if (planCost(parts) <= capacity) {
            return parts
        }
    }
    return fromBodyPlan(capacity, [WORK, MOVE])
}

export default roleHarvester
