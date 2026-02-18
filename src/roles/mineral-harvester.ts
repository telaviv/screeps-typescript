import * as Logger from 'utils/logger'

import { ResourceCreep, ResourceCreepMemory } from 'tasks/types'
import { FlatRoomPosition } from 'types'
import { getStationaryPointsBase } from 'construction-features'
import { moveToRoom } from 'utils/travel'
import { moveToStationaryPoint } from 'utils/creep'
import { profile } from 'utils/profiling'
import { spawnCreep } from 'utils/spawn'
import { fromBodyPlan } from 'utils/parts'

const ROLE = 'mineral-harvester'

/** Mineral harvester creep with typed memory */
export interface MineralHarvester extends ResourceCreep {
    memory: MineralHarvesterMemory
}

/** Memory structure for mineral harvester creeps */
interface MineralHarvesterMemory extends ResourceCreepMemory {
    role: 'mineral-harvester'
    pos: FlatRoomPosition
    mineral: Id<Mineral>
}

/**
 * Type guard to check if a creep is a mineral harvester.
 * @param creep - The creep to check
 */
export function isMineralHarvester(creep: Creep): creep is MineralHarvester {
    return creep.memory.role === ROLE
}

/**
 * Manages stationary mineral harvester behavior.
 * Mineral harvesters sit on designated positions and harvest minerals.
 */
export class MineralHarvesterCreep {
    readonly creep: MineralHarvester

    constructor(creep: MineralHarvester) {
        this.creep = creep
    }

    /**
     * Main mineral harvester behavior loop.
     * Checks suicide condition, moves to position, and harvests minerals.
     */
    @profile
    public run(): void {
        if (this.creep.spawning) {
            return
        }

        // Check suicide condition first
        if (this.shouldSuicide()) {
            Logger.info(
                'mineral-harvester:suicide',
                this.creep.name,
                'mineral depleted, wont regenerate in time',
            )
            this.creep.suicide()
            return
        }

        // Move to position if not there
        if (!this.isAtHarvestPos()) {
            Logger.info(
                'mineral-harvester:moving',
                this.creep.name,
                `(${this.creep.pos.x},${this.creep.pos.y})`,
                `->(${this.harvestPos.x},${this.harvestPos.y})`,
                `fatigue:${this.creep.fatigue}`,
            )
            this.moveToHarvestPos()
            return
        }

        // Only harvest if cooldown allows
        if (this.canHarvest()) {
            this.harvestMineral()
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

    get mineral(): Mineral {
        return Game.getObjectById(this.creep.memory.mineral) as Mineral
    }

    /**
     * Checks if the creep should commit suicide.
     * Suicides when mineral is depleted and won't regenerate before creep dies.
     */
    private shouldSuicide(): boolean {
        const mineral = this.mineral
        if (!mineral) {
            return false
        }
        return (
            mineral.mineralAmount === 0 &&
            mineral.ticksToRegeneration !== undefined &&
            mineral.ticksToRegeneration > (this.creep.ticksToLive ?? 0)
        )
    }

    /**
     * Checks if the creep can harvest the mineral.
     * Returns false if mineral is in cooldown, depleted, or container is full.
     */
    private canHarvest(): boolean {
        const mineral = this.mineral
        if (!mineral) {
            return false
        }
        // Don't harvest if mineral needs cooldown (ticksToRegeneration is 1-5 when in cooldown)
        if (mineral.ticksToRegeneration !== undefined && mineral.ticksToRegeneration > 0) {
            return false
        }
        if (mineral.mineralAmount <= 0) {
            return false
        }

        // Check if container is full
        const container = this.creep.pos
            .lookFor(LOOK_STRUCTURES)
            .find((s): s is StructureContainer => s.structureType === STRUCTURE_CONTAINER)
        if (container && container.store.getFreeCapacity() === 0) {
            return false
        }

        return true
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
        let err
        if (this.creep.room.name !== this.harvestPos.roomName) {
            err = moveToRoom(this.creep, this.harvestPos.roomName)
        } else {
            err = moveToStationaryPoint(this.harvestPos, this.creep)
        }

        Logger.info('mineral-harvester:moveToHarvestPos:result', this.creep.name, `result:${err}`)

        if (err !== OK && err !== ERR_TIRED && err !== ERR_NO_PATH) {
            Logger.error(
                'mineral-harvester:moveToHarvestPos:failure',
                this.creep.name,
                `(${this.creep.pos.x},${this.creep.pos.y})`,
                `->(${this.harvestPos.x},${this.harvestPos.y})`,
                err,
            )
        } else if (err === ERR_NO_PATH) {
            Logger.warning(
                'mineral-harvester:moveToHarvestPos:no-path',
                this.creep.name,
                `(${this.creep.pos.x},${this.creep.pos.y})`,
                `->(${this.harvestPos.x},${this.harvestPos.y})`,
            )
        }
    }

    /** Harvests minerals from the assigned mineral deposit */
    private harvestMineral(): void {
        if (this.creep.getActiveBodyparts(WORK) === 0) {
            Logger.info('mineral-harvester:harvest:no-work', this.creep.name)
            return
        }
        const err = this.creep.harvest(this.mineral)
        if (err === ERR_NOT_IN_RANGE) {
            this.moveToHarvestPos()
        } else if (err !== OK && err !== ERR_NOT_ENOUGH_RESOURCES) {
            Logger.warning(
                'mineral-harvester:harvest:failure',
                this.creep.name,
                "couldn't harvest",
                err,
            )
        }
    }
}

/** Options for creating a mineral harvester creep */
interface CreateOpts {
    /** Override energy capacity */
    capacity?: number
    /** Whether roads are built (affects body parts) */
    roadsBuilt?: boolean
}

/** Role module for mineral harvester creeps */
const roleMineralHarvester = {
    /**
     * Runs the mineral harvester behavior for a creep.
     * @param creep - The mineral harvester creep to run
     */
    run(creep: MineralHarvester): void {
        const harvester = new MineralHarvesterCreep(creep)
        harvester.run()
    },

    /**
     * Creates a mineral harvester creep for a specific mineral.
     * @param spawn - The spawn to create from
     * @param mineralId - ID of the mineral to harvest
     * @param opts - Creation options
     */
    create(
        spawn: StructureSpawn,
        mineralId: Id<Mineral>,
        opts: CreateOpts = { roadsBuilt: false },
    ): number {
        const mineral = Game.getObjectById(mineralId)
        if (!mineral || !mineral.room) {
            Logger.error('mineral-harvester:create:mineral:not-found', mineralId)
            return ERR_NOT_FOUND
        }

        // Get stationary points directly to avoid circular dependency
        const stationaryPoints = getStationaryPointsBase(mineral.room)
        if (!stationaryPoints || !stationaryPoints.mineral) {
            Logger.warning(
                'mineral-harvester:create:stationary-points:not-found',
                mineralId,
                mineral.room.name,
            )
            return ERR_NOT_FOUND
        }

        const stationaryPosition = stationaryPoints.mineral
        let capacity = spawn.room.energyCapacityAvailable
        if (opts.capacity) {
            capacity = opts.capacity
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
                    roomName: mineral.room.name,
                },
                mineral: mineralId,
                idleTimestamp: 0,
            } as MineralHarvesterMemory,
        })
        return err
    },
}

/**
 * Calculates body parts for a mineral harvester based on energy capacity.
 * Mineral harvesters only need WORK and MOVE parts (no CARRY).
 * @param capacity - Available energy capacity
 * @param roadsBuilt - If true, reduces MOVE parts for road travel
 */
export function calculateParts(capacity: number, roadsBuilt: boolean): BodyPartConstant[] {
    if (roadsBuilt) {
        return fromBodyPlan(capacity, [WORK, WORK, MOVE])
    }
    return fromBodyPlan(capacity, [WORK, MOVE])
}

export default roleMineralHarvester
