import filter from 'lodash/filter'
import some from 'lodash/some'

import DroppedEnergyManager from './dropped-energy-manager'

export default class SourceManager {
    readonly id: Id<Source>
    readonly creeps: SourceCreep[]
    readonly droppedEnergy: DroppedEnergyManager

    constructor(
        id: Id<Source>,
        creeps: SourceCreep[],
        droppedEnergy: DroppedEnergyManager,
    ) {
        this.droppedEnergy = droppedEnergy
        this.creeps = creeps
        this.id = id
    }

    static create(memory: RoomSourceMemory) {
        const droppedEnergy = DroppedEnergyManager.get(memory.dropSpot)
        const creeps = filter(Game.creeps, creep => {
            if (!creep.memory.hasOwnProperty('source')) {
                return false
            }
            const sourceMemory = creep.memory as SourceMemory
            return sourceMemory.source === memory.id
        }) as SourceCreep[]
        return new SourceManager(memory.id as Id<Source>, creeps, droppedEnergy)
    }

    static get(memory: RoomSourceMemory): SourceManager {
        return SourceManager.create(memory)
    }

    static getById(sourceId: Id<Source>): SourceManager {
        const source = Game.getObjectById(sourceId) as Source
        const sourceMemory = source.room.memory.sources.find(
            s => s.id === sourceId,
        )
        if (!sourceMemory) {
            throw Error(`not a real source ${sourceId}`)
        }
        return SourceManager.get(sourceMemory)
    }

    hasStaticHarvester(): boolean {
        const harvesters = this.creeps.filter(
            creep => creep.memory.role === 'harvester',
        )
        return some(
            harvesters,
            harvester =>
                harvester.pos.x === this.droppedEnergy.pos.x &&
                harvester.pos.y === this.droppedEnergy.pos.y,
        )
    }
}
