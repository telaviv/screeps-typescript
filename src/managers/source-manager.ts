import filter from 'lodash/filter'
import some from 'lodash/some'

import DroppedEnergyManager from './dropped-energy-manager'
import { fromRoom } from 'utils/immutable-room'
import { getHarvesters, getLogisticsCreeps } from 'utils/creep'
import { Harvester } from 'roles/harvester'
import { LogisticsCreep } from 'roles/logistics-constants'

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

    public static create(memory: RoomSourceMemory) {
        const droppedEnergy = DroppedEnergyManager.get(memory.dropSpot)
        const source = Game.getObjectById(memory.id)!
        return new SourceManager(source, droppedEnergy)
    }

    public static get(memory: RoomSourceMemory): SourceManager {
        return SourceManager.create(memory)
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
            getLogisticsCreeps({ taskType: 'mining' }),
            (creep: LogisticsCreep) => creep.memory.tasks && creep.memory.tasks[0].source === this.id,
        )
    }

    public get positions(): RoomPosition[] {
        const iroom = fromRoom(this.room)
        const neighbors = iroom.getClosestNeighbors(this.source.pos.x, this.source.pos.y)
        return neighbors.filter((npos) => !npos.isObstacle()).map((ipos) => ipos.pos)
    }

    static getById(sourceId: Id<Source>): SourceManager {
        const source = Game.getObjectById(sourceId)
        const sourceMemory = source!.room.memory.sources.find(
            (s) => s.id === sourceId,
        )
        if (!sourceMemory) {
            throw Error(`not a real source ${sourceId}`)
        }
        return SourceManager.get(sourceMemory)
    }

    public hasStaticHarvester(): boolean {
        return some(
            this.harvesters,
            (harvester: Creep) =>
                harvester.pos.x === this.droppedEnergy.pos.x &&
                harvester.pos.y === this.droppedEnergy.pos.y,
        )
    }

    public isContainerMining(): boolean {
        return this.droppedEnergy.getContainer() !== null
    }

    public hasEnoughHarvesters(): boolean {
        console.log(`Source:hasEnoughHarvesters ${this.id}`, JSON.stringify(this.harvesters))
        const works = this.harvesters.reduce((works, creep) => { return creep.getActiveBodyparts(WORK) + works }, 0)
        if (works >= 10) {
            return true
        }
        console.log(`Source:hasEnoughHarvesters ${this.id} available`, JSON.stringify(this.getAvailableHarvesterPositions()))
        return this.getAvailableHarvesterPositions().length === 0
    }

    public hasEnoughAuxHarvesters(): boolean {
        const works = this.auxHarvesters.reduce((works, creep) => { return creep.getActiveBodyparts(WORK) + works }, 0)
        if (works >= 10) {
            return true
        }
        return this.getAvailableAuxHarvesterPositions().length === 0
    }

    public getAvailableHarvesterPositions(): RoomPosition[] {
        const harvesters = this.harvesters
        const available: RoomPosition[] = [];
        for (const pos of this.positions) {
            for (const harvester of harvesters) {
                if (pos.isEqualTo(harvester.memory.pos.x, harvester.memory.pos.y)) {
                    continue;
                }
            }
            available.push(pos);
        }
        return available;
    }

    public getAvailableAuxHarvesterPositions(): RoomPosition[] {
        const harvesters = this.harvesters
        const auxHarvesters = this.auxHarvesters
        const available: RoomPosition[] = [];
        for (const pos of this.positions) {
            for (const harvester of harvesters) {
                if (pos.isEqualTo(harvester.memory.pos.x, harvester.memory.pos.y)) {
                    continue;
                }
            }
            for (const auxHarvester of auxHarvesters) {
                const auxPos = auxHarvester.memory.tasks[0].pos;
                if (pos.isEqualTo(auxPos.x, auxPos.y)) {
                    continue;
                }
            }
            available.push(pos);
        }
        return available;
    }

}
