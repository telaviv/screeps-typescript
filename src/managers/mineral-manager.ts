import * as Logger from 'utils/logger'
import { getStationaryPointsBase } from 'construction-features'
import { getContainerAt } from 'utils/room-position'
import { getCreeps } from 'utils/creep'
import { getExtractor } from 'utils/room'
import roleMineralHarvester from 'roles/mineral-harvester'

/** Options for creating mineral harvester creeps */
interface CreateOpts {
    /** Whether roads are built (affects body parts) */
    roadsBuilt?: boolean
    /** Override energy capacity */
    capacity?: number
}

/**
 * Manages a single mineral and its extraction location.
 * Provides access to the mineral's container position for harvesting.
 */
export default class MineralManager {
    /** Unique identifier of the mineral */
    public readonly id: Id<Mineral>
    /** The mineral game object */
    public readonly mineral: Mineral
    /** Position of the container at this mineral */
    public readonly containerPosition: RoomPosition

    /**
     * Creates a new MineralManager (use factory methods instead).
     * @param mineral - The mineral to manage
     */
    private constructor(mineral: Mineral) {
        if (!mineral.room) {
            throw new Error(`mineral ${mineral.id} has no room`)
        }
        const stationaryPoints = getStationaryPointsBase(mineral.room)
        if (!stationaryPoints || !stationaryPoints.mineral) {
            throw new Error(`stationaryPoints.mineral is not defined for room ${mineral.room.name}`)
        }
        this.id = mineral.id
        this.mineral = mineral
        const containerPosition = stationaryPoints.mineral
        this.containerPosition = new RoomPosition(
            containerPosition.x,
            containerPosition.y,
            mineral.room.name,
        )
    }

    /**
     * Creates a MineralManager from a Mineral object.
     * @param mineral - The mineral to manage
     */
    public static createFromMineral(mineral: Mineral): MineralManager {
        return new MineralManager(mineral)
    }

    /**
     * Creates a MineralManager from a mineral ID.
     * @param id - The mineral ID
     * @throws Error if mineral not found
     */
    public static createFromMineralId(id: Id<Mineral>): MineralManager {
        const mineral = Game.getObjectById(id)
        if (!mineral) {
            throw new Error(`mineral-manager:createFromMineralId:mineral ${id} is not found`)
        }
        return new MineralManager(mineral)
    }

    /** Gets the room containing this mineral */
    public get room(): Room {
        if (!this.mineral.room) {
            throw new Error(`mineral ${this.id} has no room`)
        }
        return this.mineral.room
    }

    /** Gets the mineral type (e.g., 'H', 'O', 'Z', etc.) */
    public get mineralType(): MineralConstant {
        return this.mineral.mineralType
    }

    /** Gets the current amount of mineral available */
    public get mineralAmount(): number {
        return this.mineral.mineralAmount
    }

    /** Gets the number of ticks until the mineral regenerates */
    public get ticksToRegeneration(): number | undefined {
        return this.mineral.ticksToRegeneration
    }

    /**
     * Run any per-tick logic for this mineral.
     * Currently a placeholder for future mineral management features.
     */
    public run(): void {
        // Future: Track mineral harvesting, manage extractor, etc.
    }

    /** Gets the container at the mineral position, if any */
    get container(): StructureContainer | null {
        return getContainerAt(this.containerPosition)
    }

    /** Gets the extractor at the mineral position, if any */
    get extractor(): StructureExtractor | null {
        return getExtractor(this.room)
    }

    /** Gets all mineral harvester creeps assigned to this mineral */
    get mineralHarvesters(): Creep[] {
        return getCreeps('mineral-harvester', this.room).filter((creep) => {
            const memory = creep.memory as { mineral?: Id<Mineral> }
            return memory.mineral === this.id
        })
    }

    /**
     * Checks if the mineral container has resources available for withdrawal.
     * @returns True if container exists and has minerals
     */
    public hasWithdrawableMinerals(): boolean {
        const container = this.container
        if (!container) {
            return false
        }
        return container.store.getUsedCapacity(this.mineralType) > 0
    }

    /**
     * Determines if a mineral harvester should be built.
     * Returns true if:
     * - RCL >= 6 (extractor requirement)
     * - Room has real storage (not terminal/virtual storage)
     * - Extractor is built
     * - Container is built
     * - Mineral has resources available (mineralAmount > 0)
     * - No mineral harvester currently exists for this mineral
     */
    public shouldBuildMineralHarvester(): boolean {
        // Check RCL requirement
        const rcl = this.room.controller?.level ?? 0
        if (rcl < 6) {
            return false
        }

        // Require real storage (not terminal or virtual storage)
        if (!this.room.storage) {
            return false
        }

        // Check if extractor is built
        if (!this.extractor) {
            return false
        }

        // Check if container is built
        if (!this.container) {
            return false
        }

        // Check if mineral has resources
        if (this.mineralAmount <= 0) {
            return false
        }

        // Check if a mineral harvester already exists
        if (this.mineralHarvesters.length > 0) {
            return false
        }

        return true
    }
}

/**
 * Gets a MineralManager for a room's mineral.
 * @param room - The room to get mineral manager for
 * @returns MineralManager or null if no mineral found or no stationary points
 */
export function getMineralManager(room: Room): MineralManager | null {
    try {
        const minerals = room.find(FIND_MINERALS)
        if (minerals.length === 0) {
            return null
        }
        return MineralManager.createFromMineral(minerals[0])
    } catch (error) {
        Logger.warning('getMineralManager:error', room.name, error)
        return null
    }
}

/**
 * Creates a mineral harvester creep for a mineral.
 * @param spawn - The spawn to create from
 * @param mineralId - ID of the mineral to harvest
 * @param opts - Creation options
 * @returns Spawn result code
 * @throws Error if conditions not met for mineral harvesting
 */
export function createMineralHarvester(
    spawn: StructureSpawn,
    mineralId: Id<Mineral>,
    opts: CreateOpts = { roadsBuilt: false },
): number {
    const mineral = Game.getObjectById(mineralId)
    if (!mineral || !mineral.room) {
        throw new Error(`mineral-manager:createMineralHarvester: mineral ${mineralId} not found`)
    }

    const mineralManager = getMineralManager(mineral.room)
    if (!mineralManager || !mineralManager.shouldBuildMineralHarvester()) {
        throw new Error(
            `mineral-manager:createMineralHarvester: cannot create harvester for ${mineralId}`,
        )
    }

    return roleMineralHarvester.create(spawn, mineralId, opts)
}
