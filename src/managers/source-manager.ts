import filter from 'lodash/filter'
import some from 'lodash/some'

import DroppedEnergyManager from './dropped-energy-manager'
import { fromRoom } from 'utils/immutable-room'
import { getHarvesters, getLogisticsCreeps } from 'utils/creep'
import { Harvester, isHarvester } from 'roles/harvester'
import { LogisticsCreep } from 'roles/logistics-constants'
import { isMiningTask } from 'tasks/mining/utils'
import { MiningTask } from 'tasks/mining/types'

import * as Logger from 'utils/logger'

const MAX_WORK_PARTS = 5

export default class SourceManager {
    public readonly id: Id<Source>
    public readonly source: Source
    public readonly droppedEnergy: DroppedEnergyManager

    private constructor(
        source: Source,
        droppedEnergy: DroppedEnergyManager,
    ) {
        this.id = source.id
        this.source = source
        this.droppedEnergy = droppedEnergy
    }

    public static createFromSource(source: Source) {
        const droppedEnergy = DroppedEnergyManager.createFromSourceId(source.id)
        return new SourceManager(source, droppedEnergy)
    }

    public static createFromSourceId(id: Id<Source>) {
        const source = Game.getObjectById(id)!
        const droppedEnergy = DroppedEnergyManager.createFromSourceId(id)
        return new SourceManager(source, droppedEnergy)
    }

    public get room(): Room {
        return this.source.room
    }

    public get containerPosition(): RoomPosition {
        return this.droppedEnergy.pos
    }

    public get harvesters(): Harvester[] {
        return filter(
            getHarvesters(this.room),
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

    public get positions(): RoomPosition[] {
        const iroom = fromRoom(this.room)
        const neighbors = iroom.getClosestNeighbors(this.source.pos.x, this.source.pos.y)
        return neighbors.filter((npos) => !npos.isObstacle()).map((ipos) => ipos.pos)
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

    public isContainerMining(): boolean {
        return this.droppedEnergy.getContainer() !== null
    }

    public hasEnoughHarvesters(): boolean {
        Logger.info(
            'hasEnoughHarvesters',
            this.room.name,
            this.id,
            this.harvesters.length,
            this.getAvailableHarvesterPositions().length,
            this.hasStaticHarvester())

        if (!this.hasStaticHarvester()) {
            return false
        }
        const works = this.harvesters.reduce((works, creep) => { return creep.getActiveBodyparts(WORK) + works }, 0)
        if (works >= MAX_WORK_PARTS) {
            return true
        }
        return this.getAvailableHarvesterPositions().length === 0
    }

    public hasEnoughAuxHarvesters(): boolean {
        const works = this.allHarvesters.reduce((works, creep) => { return creep.getActiveBodyparts(WORK) + works }, 0)
        if (works >= MAX_WORK_PARTS) {
            return true
        }
        return this.getAvailableAuxHarvesterPositions().length === 0
    }

    public getAvailableHarvesterPositions(): RoomPosition[] {
        const harvesters = this.harvesters
        const available: RoomPosition[] = [];
        for (const pos of this.positions) {
            let isAvailable = true;
            for (const harvester of harvesters) {
                if (pos.isEqualTo(harvester.memory.pos.x, harvester.memory.pos.y)) {
                    isAvailable = false;
                    break;
                }
            }
            if (isAvailable) {
                available.push(pos);
            }
        }
        return available;
    }

    public getAvailableAuxHarvesterPositions(): RoomPosition[] {
        if (this.source.energy === 0) {
            return []
        }

        const harvesters = this.harvesters
        const available: RoomPosition[] = [];
        for (const pos of this.positions) {
            let isAvailable = true;
            for (const harvester of harvesters) {
                if (pos.isEqualTo(harvester.memory.pos.x, harvester.memory.pos.y)) {
                    isAvailable = false;
                    break;
                }
            }
            for (const task of this.getAuxTasks()) {
                if (pos.isEqualTo(task.pos.x, task.pos.y)) {
                    isAvailable = false;
                    break;
                }
            }
            if (isAvailable) {
                available.push(pos);
            }
        }
        return available;
    }
}
