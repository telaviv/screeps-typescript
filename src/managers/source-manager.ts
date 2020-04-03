import filter from 'lodash/filter'

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

    hasStaticHarvester(): boolean {
        const filtered = this.creeps.filter(
            creep => creep.memory.role === 'harvester',
        )
        return filtered.length > 0
    }
}
