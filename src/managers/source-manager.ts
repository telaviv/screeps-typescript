import filter from 'lodash/filter'
import some from 'lodash/some'

import DroppedEnergyManager from './dropped-energy-manager'
import { getAllHarvesters, getLogisticsCreeps } from 'utils/creep'
import { Harvester, isHarvester } from 'roles/harvester'
import { LogisticsCreep } from 'roles/logistics-constants'
import { isMiningTask } from 'tasks/mining/utils'
import { MiningTask } from 'tasks/mining/types'

import { profile } from 'utils/profiling'
import { getNonObstacleNeighbors } from 'utils/room-position'
import { Position } from 'types'
import * as Logger from 'utils/logger'

const MAX_WORK_PARTS = 5

export default class SourceManager {
    public readonly id: Id<Source>
    public readonly source: Source
    public readonly containerPosition: RoomPosition;

    private constructor(
        source: Source,
    ) {
        this.id = source.id
        this.source = source
        const containerPosition = this.source.room.memory.stationaryPoints!.sources[this.id]
        this.containerPosition = new RoomPosition(containerPosition.x, containerPosition.y, source.room.name)
    }

    public static createFromSource(source: Source) {
        return new SourceManager(source)
    }

    public static createFromSourceId(id: Id<Source>) {
        const source = Game.getObjectById(id)!
        return new SourceManager(source)
    }

    public get room(): Room {
        return this.source.room
    }

    public get harvesters(): Harvester[] {
        return filter(
            getAllHarvesters(),
            (creep: Harvester) => creep.memory.source === this.id,
        )
    }

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

    public get allHarvesters(): Creep[] {
        return [...this.harvesters, ...this.auxHarvesters]
    }

    public getPositions(): RoomPosition[] {
        return getNonObstacleNeighbors(this.source.pos)
    }

    static getById(sourceId: Id<Source>): SourceManager {
        return SourceManager.createFromSourceId(sourceId)
    }

    public hasStaticHarvester(): boolean {
        return some(
            this.harvesters,
            (harvester: Creep) => isHarvester(harvester) && harvester.memory.source === this.id,
        )
    }

    public hasEnoughHarvesters(): boolean {
        if (!this.hasStaticHarvester()) {
            return false
        }
        if (hasEnoughWorkParts(this.harvesters)) {
            return true
        }
        const nextAvailable = this.getNextAvailableHarvesterPosition()
        return this.getNextAvailableHarvesterPosition() === null
    }

    public hasEnoughAuxHarvesters(): boolean {
        if (hasEnoughWorkParts(this.allHarvesters)) {
            return true
        }
        return this.getNextAvailableAuxHarvestPosition() === null
    }

    @profile
    public getNextAvailableHarvesterPosition(): RoomPosition | null {
        if (this.source.energy === 0 || hasEnoughWorkParts(this.harvesters)) {
            return null
        }
        const harvesters = this.harvesters

        for (const pos of this.getPositions()) {
            let isAvailable = true;
            for (const harvester of harvesters) {
                if (pos.isEqualTo(harvester.memory.pos.x, harvester.memory.pos.y)) {
                    isAvailable = false;
                    break;
                }
            }
            if (isAvailable) {
                return pos
            }
        }
        return null
    }

    @profile
    public getNextAvailableAuxHarvestPosition(): RoomPosition | null {
        if (this.source.energy === 0 || hasEnoughWorkParts(this.allHarvesters)) {
            return null
        }

        const harvesters = this.harvesters
        for (const pos of this.getPositions()) {
            let isAvailable = true;
            for (const harvester of harvesters) {
                if (pos.isEqualTo(harvester.memory.pos.x, harvester.memory.pos.y)) {
                    isAvailable = false;
                    break
                }
            }
            if (!isAvailable) {
                continue
            }
            for (const task of this.getAuxTasks()) {
                if (pos.isEqualTo(task.pos.x, task.pos.y)) {
                    isAvailable = false;
                    break;
                }
            }
            if (isAvailable) {
                if (!pos.inRangeTo(this.source.pos, 1)) {
                    Logger.error(
                        `source-manager:getNextAvailableAuxHarvesterPosition:failed`,
                        `position ${pos} is not in range of source ${this.id}`, this.getPositions())
                    return null
                }
                return pos
            }
        }
        return null;
    }
}

function totalWorkCount(creeps: Creep[]): number {
    return creeps.reduce((works, creep) => { return creep.getActiveBodyparts(WORK) + works }, 0)
}

function hasEnoughWorkParts(creeps: Creep[]): boolean {
    return totalWorkCount(creeps) >= MAX_WORK_PARTS
}
1
