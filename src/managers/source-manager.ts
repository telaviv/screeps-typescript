import filter from 'lodash/filter'

import * as Logger from 'utils/logger'
import { Harvester, isHarvester } from 'roles/harvester'
import { getAllHarvesters, getLogisticsCreeps } from 'utils/creep'
import { LogisticsCreep } from 'roles/logistics-constants'
import { MiningTask } from 'tasks/mining/types'
import { getNonObstacleNeighbors } from 'utils/room-position'
import { getStationaryPoints } from 'construction-features'
import { isMiningTask } from 'tasks/mining/utils'
import { profile } from 'utils/profiling'

/** Maximum WORK parts needed to fully harvest a source (5 + buffer) */
const MAX_WORK_PARTS = 5 + 1 // allow for some buffer

/**
 * Manages a single energy source and its assigned harvesters.
 * Tracks harvester positions and determines available slots.
 */
export default class SourceManager {
    /** Unique identifier of the source */
    public readonly id: Id<Source>
    /** The source game object */
    public readonly source: Source
    /** Position of the container at this source */
    public readonly containerPosition: RoomPosition

    /**
     * Creates a new SourceManager (use factory methods instead).
     * @param source - The source to manage
     */
    private constructor(source: Source) {
        const stationaryPoints = getStationaryPoints(source.room)
        if (!stationaryPoints || !stationaryPoints.sources) {
            throw new Error(`stationaryPoints.sources is not defined for room ${source.room.name}`)
        }
        this.id = source.id
        this.source = source
        const containerPosition = stationaryPoints.sources[this.id]
        this.containerPosition = new RoomPosition(
            containerPosition.x,
            containerPosition.y,
            source.room.name,
        )
    }

    /**
     * Creates a SourceManager from a Source object.
     * @param source - The source to manage
     */
    public static createFromSource(source: Source): SourceManager {
        return new SourceManager(source)
    }

    /**
     * Creates a SourceManager from a source ID.
     * @param id - The source ID
     * @throws Error if source not found
     */
    public static createFromSourceId(id: Id<Source>): SourceManager {
        const source = Game.getObjectById(id)
        if (!source) {
            throw new Error(`source-manager:createFromSourceId:source ${id} is not found`)
        }
        return new SourceManager(source)
    }

    /** Gets the room containing this source */
    public get room(): Room {
        return this.source.room
    }

    /** Gets all dedicated harvesters assigned to this source */
    public get harvesters(): Harvester[] {
        return filter(getAllHarvesters(), (creep: Harvester) => creep.memory.source === this.id)
    }

    /** Gets logistics creeps with mining tasks at this source */
    public get auxHarvesters(): LogisticsCreep[] {
        return filter(
            getLogisticsCreeps({ room: this.room, taskType: 'mining' }),
            (creep: LogisticsCreep) => {
                if (!creep.memory.tasks || creep.memory.tasks.length === 0) {
                    return false
                }
                const task = creep.memory.tasks[0]
                if (isMiningTask(task)) {
                    return task.source === this.id
                }
                return false
            },
        )
    }

    /** Gets all mining tasks assigned to auxiliary harvesters */
    public getAuxTasks(): MiningTask[] {
        const tasks: MiningTask[] = []
        for (const auxHarvester of this.auxHarvesters) {
            const task = auxHarvester.memory.tasks[0]
            if (isMiningTask(task)) {
                tasks.push(task)
            }
        }
        return tasks
    }

    /** Gets all harvesters (dedicated + auxiliary) */
    public get allHarvesters(): Creep[] {
        return [...this.harvesters, ...this.auxHarvesters]
    }

    /** Gets all valid harvest positions adjacent to this source */
    public getPositions(): RoomPosition[] {
        return getNonObstacleNeighbors(this.source.pos)
    }

    /**
     * Gets a SourceManager by source ID.
     * @param sourceId - The source ID
     */
    static getById(sourceId: Id<Source>): SourceManager {
        return SourceManager.createFromSourceId(sourceId)
    }

    /** Checks if any harvester is assigned to this source */
    public hasStaticHarvester(): boolean {
        return this.harvesters.some(
            (harvester: Creep) => isHarvester(harvester) && harvester.memory.source === this.id,
        )
    }

    /** Checks if a harvester is at the container position */
    public hasContainerHarvester(): boolean {
        return this.harvesters.some((harvester: Creep) => {
            return (
                isHarvester(harvester) &&
                harvester.memory.source === this.id &&
                harvester.memory.pos.x === this.containerPosition.x &&
                harvester.memory.pos.y === this.containerPosition.y
            )
        })
    }

    /** Checks if enough harvesters are assigned (container position filled or max work parts) */
    public hasEnoughHarvesters(): boolean {
        if (!this.hasContainerHarvester()) {
            return false
        }
        if (hasEnoughWorkParts(this.harvesters)) {
            return true
        }
        return this.getNextAvailableHarvesterPosition() === null
    }

    /** Checks if enough auxiliary harvesters are assigned */
    public hasEnoughAuxHarvesters(): boolean {
        if (hasEnoughWorkParts(this.allHarvesters)) {
            return true
        }
        return this.getNextAvailableAuxHarvestPosition() === null
    }

    /** Gets the next available position for a dedicated harvester */
    @profile
    public getNextAvailableHarvesterPosition(): RoomPosition | null {
        if (this.source.energy === 0 || hasEnoughWorkParts(this.harvesters)) {
            return null
        }
        const harvesters = this.harvesters

        for (const pos of this.getPositions()) {
            let isAvailable = true
            for (const harvester of harvesters) {
                if (pos.isEqualTo(harvester.memory.pos.x, harvester.memory.pos.y)) {
                    isAvailable = false
                    break
                }
            }
            if (isAvailable) {
                return pos
            }
        }
        return null
    }

    /** Gets the next available position for an auxiliary harvester */
    @profile
    public getNextAvailableAuxHarvestPosition(): RoomPosition | null {
        if (this.source.energy === 0 || hasEnoughWorkParts(this.allHarvesters)) {
            return null
        }

        const harvesters = this.harvesters

        for (const pos of this.getPositions()) {
            let isAvailable = true
            for (const harvester of harvesters) {
                if (pos.isEqualTo(harvester.memory.pos.x, harvester.memory.pos.y)) {
                    isAvailable = false
                    break
                }
            }
            if (!isAvailable) {
                continue
            }
            for (const task of this.getAuxTasks()) {
                if (pos.isEqualTo(task.pos.x, task.pos.y)) {
                    isAvailable = false
                    break
                }
            }
            if (isAvailable) {
                if (!pos.inRangeTo(this.source.pos, 1)) {
                    Logger.error(
                        `source-manager:getNextAvailableAuxHarvesterPosition:failed`,
                        `position ${pos} is not in range of source ${this.id}`,
                        this.getPositions(),
                    )
                    return null
                }
                return pos
            }
        }
        return null
    }
}

/**
 * Calculates total WORK parts across a group of creeps.
 * @param creeps - Array of creeps to count
 */
function totalWorkCount(creeps: Creep[]): number {
    return creeps.reduce((works, creep) => {
        return creep.getActiveBodyparts(WORK) + works
    }, 0)
}

/**
 * Checks if creeps have enough WORK parts to fully harvest a source.
 * @param creeps - Array of creeps to check
 */
function hasEnoughWorkParts(creeps: Creep[]): boolean {
    return totalWorkCount(creeps) >= MAX_WORK_PARTS
}
