import * as Logger from 'utils/logger'
import SourceManager from './source-manager'
import { getHarvesters } from 'utils/creep'
import { isSurveyComplete } from 'surveyor'
import { profile } from 'utils/profiling'
import roleHarvester from 'roles/harvester'

/** Options for creating harvester creeps */
interface CreateOpts {
    /** Whether to use available energy (rescue mode) */
    rescue?: boolean
    /** Override energy capacity */
    capacity?: number
    /** Whether roads are built (affects body parts) */
    roadsBuilt?: boolean
}

/**
 * Manages all energy sources in a room.
 * Coordinates harvester creation and assignment across multiple sources.
 */
export default class SourcesManager {
    /** The room being managed */
    private room: Room
    /** Individual source managers for each source */
    private sourceManagers: SourceManager[]

    /**
     * Creates a new SourcesManager.
     * @param room - The room to manage sources for
     */
    constructor(room: Room) {
        this.room = room
        this.sourceManagers = []

        // Initialize sourceManagers array with SourceManager instances
        const sources = this.room.find(FIND_SOURCES)
        for (const source of sources) {
            const sourceManager = SourceManager.createFromSource(source)
            this.sourceManagers.push(sourceManager)
        }
    }

    /**
     * Factory method to create a SourcesManager if survey is complete.
     * @param room - The room to create manager for
     * @returns SourcesManager or null if survey incomplete
     */
    public static create(room: Room): SourcesManager | null {
        if (isSurveyComplete(room)) {
            return new SourcesManager(room)
        }
        return null
    }

    /** Checks if any source has at least one harvester */
    public hasAHarvester(): boolean {
        for (const sourceManager of this.sourceManagers) {
            if (sourceManager.harvesters.length > 0) {
                return true
            }
        }
        return false
    }

    /** Checks if all sources have enough harvesters */
    public hasEnoughHarvesters(): boolean {
        for (const sourceManager of this.sourceManagers) {
            if (!sourceManager.hasEnoughHarvesters()) {
                Logger.info(
                    'sources-manager:hasEnoughHarvesters:notEnoughHarvesters',
                    this.room.name,
                    sourceManager.id,
                )
                return false
            }
        }
        return true
    }

    /** Checks if all sources have enough auxiliary harvesters */
    public hasEnoughAuxHarvesters(): boolean {
        for (const sourceManager of this.sourceManagers) {
            if (!sourceManager.hasEnoughAuxHarvesters()) {
                return false
            }
        }
        return true
    }

    /** Checks if all sources have a harvester at the container position */
    public hasAllContainerHarvesters(): boolean {
        return this.sourceManagers.every((sourceManager) => sourceManager.hasContainerHarvester())
    }

    /**
     * Gets the next target for a new dedicated harvester.
     * Prioritizes container positions, then available adjacent positions.
     */
    public getNextHarvesterMiningTarget(): {
        source: Id<Source>
        pos: RoomPosition
    } | null {
        let source: Id<Source> | null = null
        let pos: RoomPosition | null = null
        for (const sourceManager of this.sourceManagers) {
            if (!sourceManager.hasContainerHarvester()) {
                pos = sourceManager.containerPosition
                source = sourceManager.id
            }
        }
        if (pos && source) {
            return { source, pos }
        }
        for (const sourceManager of this.sourceManagers) {
            const position = sourceManager.getNextAvailableHarvesterPosition()
            if (position !== null) {
                pos = position
                source = sourceManager.id
                break
            }
        }
        if (pos && source) {
            if (this.verifyPositionAvailable(pos, source)) {
                return { source, pos }
            } else {
                Logger.error(`position ${pos}/${source} is not available for a new harvester}`)
            }
        }
        return null
    }

    /** Gets the next target for an auxiliary harvester */
    @profile
    public getNextAuxHarvesterMiningTarget(): {
        source: Id<Source>
        pos: RoomPosition
    } | null {
        let source: Id<Source> | null = null
        let pos: RoomPosition | null = null
        for (const sourceManager of this.sourceManagers) {
            const position = sourceManager.getNextAvailableAuxHarvestPosition()
            if (position !== null) {
                pos = position
                source = sourceManager.id
                break
            }
        }
        if (pos && source) {
            return { source, pos }
        }
        return null
    }

    /**
     * Creates a harvester creep for the next available position.
     * @param spawn - The spawn to create from
     * @param opts - Creation options
     * @returns Spawn result code
     * @throws Error if no positions available
     */
    public createHarvester(
        spawn: StructureSpawn,
        opts: CreateOpts = { rescue: false, roadsBuilt: false, capacity: 0 },
    ): number {
        const target = this.getNextHarvesterMiningTarget()
        if (!target) {
            throw new Error('no available positions for harvester')
        }
        const { pos, source } = target
        const sourceManager = SourceManager.getById(source)
        return roleHarvester.create(spawn, sourceManager.id, pos, opts)
    }

    /**
     * Verifies a position is not already assigned to another harvester.
     * @param pos - The position to check
     * @param source - The source ID
     */
    private verifyPositionAvailable(pos: RoomPosition, source: Id<Source>): boolean {
        const harvesters = getHarvesters(this.room)
        for (const harvester of harvesters) {
            if (
                harvester.memory.source === source &&
                harvester.memory.pos.x === pos.x &&
                harvester.memory.pos.y === pos.y
            ) {
                return false
            }
        }
        return true
    }
}
