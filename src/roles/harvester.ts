/* eslint-disable import/no-named-as-default-member */

import * as Logger from 'utils/logger'

import PickupRunner, { addPickupTask } from 'tasks/pickup'
import { ResourceCreep, ResourceCreepMemory } from 'tasks/types'
import WithdrawRunner, { addWithdrawTask } from 'tasks/withdraw'
import { byPartCount, fromBodyPlan, planCost } from 'utils/parts'
import { hasNoEnergy, isFullOfEnergy } from 'utils/energy-harvesting'
import { FlatRoomPosition } from 'types'
import { getContainerAt } from 'utils/room-position'
import { getMinePaths, getStationaryPoints } from 'construction-features'
import { isPickupTask } from 'tasks/pickup/utils'
import { isWithdrawTask } from 'tasks/withdraw/utils'
import { deltaToDirection, followMinePath, getSourcePathKey } from 'utils/mine-travel'
import { isMineTravel, moveToRoom, moveWithinRoom } from 'utils/travel'
import { moveToStationaryPoint } from 'utils/creep'
import { profile } from 'utils/profiling'
import { spawnCreep } from 'utils/spawn'

/** Maximum WORK parts for harvest tick calculation */
const MAX_WORK_PARTS = 5

const ROLE = 'harvester'

/** Body plans for harvesters, sorted from largest to smallest */
const BODY_PLANS = [
    { [MOVE]: 11, [WORK]: 11, [CARRY]: 1 },
    { [MOVE]: 10, [WORK]: 10, [CARRY]: 1 },
    { [MOVE]: 9, [WORK]: 9, [CARRY]: 1 },
    { [MOVE]: 8, [WORK]: 8, [CARRY]: 1 },
    { [MOVE]: 7, [WORK]: 7, [CARRY]: 1 },
    { [MOVE]: 6, [WORK]: 6, [CARRY]: 1 },
    { [MOVE]: 6, [WORK]: 6 },
    { [MOVE]: 5, [WORK]: 5 },
    { [MOVE]: 4, [WORK]: 4 },
    { [MOVE]: 3, [WORK]: 3 },
    { [MOVE]: 2, [WORK]: 2 },
    { [MOVE]: 1, [WORK]: 1 },
]

/** Harvester creep with typed memory */
export interface Harvester extends ResourceCreep {
    memory: HarvesterMemory
}

/** Memory structure for harvester creeps */
interface HarvesterMemory extends ResourceCreepMemory {
    role: 'harvester'
    pos: FlatRoomPosition
    source: Id<Source>
}

/**
 * Type guard to check if a creep is a harvester.
 * @param creep - The creep to check
 */
export function isHarvester(creep: Creep): creep is Harvester {
    return creep.memory.role === ROLE
}

/**
 * Manages stationary harvester behavior.
 * Harvesters sit on designated positions, harvest sources, and transfer to links.
 */
export class HarvesterCreep {
    readonly creep: Harvester

    constructor(creep: Harvester) {
        this.creep = creep
    }

    /** Gets the container at the harvest position, if any */
    get container(): StructureContainer | null {
        return getContainerAt(this.harvestPos)
    }

    /**
     * Main harvester behavior loop.
     * Moves to position, harvests, repairs container, and transfers to link.
     */
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

    /** Gets the designated harvest position as a RoomPosition */
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

    /** Determines if this tick should harvest based on work parts and source energy */
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

    /** Checks if the creep is at its designated harvest position */
    private isAtHarvestPos(): boolean {
        return (
            this.creep.pos.x === this.harvestPos.x &&
            this.creep.pos.y === this.harvestPos.y &&
            this.creep.pos.roomName === this.harvestPos.roomName
        )
    }

    /** Moves the creep to its designated harvest position */
    private moveToHarvestPos(): void {
        const mineRoom = this.harvestPos.roomName
        const home = this.creep.memory.home
        if (home && mineRoom !== home && isMineTravel(home, mineRoom)) {
            const minePaths = getMinePaths(mineRoom)
            const fullPath = minePaths?.[getSourcePathKey(mineRoom, this.creep.memory.source)]
            if (fullPath && fullPath.length > 0) {
                const result = followMinePath(this.creep, fullPath, 'harvester:moveToHarvestPos')
                if (result === OK || result === ERR_TIRED) return
                // If the creep is not in the mine room yet, walk toward the path in this room
                if (this.creep.room.name !== mineRoom) {
                    const roomName = this.creep.room.name
                    const firstInRoom = fullPath.find((s) => s.roomName === roomName)
                    if (firstInRoom) {
                        moveWithinRoom(this.creep, {
                            pos: new RoomPosition(firstInRoom.x, firstInRoom.y, roomName),
                            range: 0,
                        })
                    }
                    return
                }
                // In the mine room: if exactly one step away, move directly without pathfinding.
                const dx = this.harvestPos.x - this.creep.pos.x
                const dy = this.harvestPos.y - this.creep.pos.y
                if (Math.abs(dx) <= 1 && Math.abs(dy) <= 1) {
                    this.creep.move(deltaToDirection(dx as -1 | 0 | 1, dy as -1 | 0 | 1))
                    return
                }
            }
        }

        let err
        if (this.creep.room.name !== mineRoom) {
            err = moveToRoom(this.creep, mineRoom)
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

    /** Harvests energy from the assigned source */
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

    /** Checks if the harvester can transfer energy to a nearby link */
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

    /** Transfers carried energy to the adjacent link */
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

    /** Checks if the container needs repair and creep can repair it */
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

    /** Collects dropped energy and withdraws from container at harvest position */
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

    /** Repairs the container at the harvest position */
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

    /** Finds the link adjacent to the harvest position */
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
/** Options for creating a harvester creep */
interface CreateOpts {
    rescue?: boolean
    capacity?: number
    roadsBuilt?: boolean
}

/** Role module for harvester creeps */
const roleHarvester = {
    /**
     * Runs the harvester behavior for a creep.
     * @param creep - The harvester creep to run
     */
    run(creep: Harvester): void {
        const harvester = new HarvesterCreep(creep)
        harvester.run()
    },

    /**
     * Creates a harvester creep for a specific source.
     * @param spawn - The spawn to create from
     * @param sourceId - ID of the source to harvest
     * @param pos - Optional override position
     * @param opts - Creation options
     */
    create(
        spawn: StructureSpawn,
        sourceId: Id<Source>,
        pos: RoomPosition | null = null,
        opts: CreateOpts = { rescue: false, roadsBuilt: false },
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
        let capacity = spawn.room.energyCapacityAvailable
        if (opts.capacity) {
            capacity = opts.capacity
        } else if (opts.rescue) {
            capacity = Math.max(300, spawn.room.energyAvailable)
        }
        const parts = calculateParts(capacity, opts.roadsBuilt ?? false)
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

/**
 * Calculates body parts for a harvester based on energy capacity.
 * @param capacity - Available energy capacity
 * @param roadsBuilt - If true, reduces MOVE parts for road travel
 */
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
