import maxBy from 'lodash/maxBy'
import SourceManager from './source-manager'

export default class EnergyManager {
    sources: SourceManager[]

    constructor(sources: SourceManager) {
        this.sources = sources
    }

    static create(memory: RoomMemory) {
        const sources: SourceManager = memory.sources(source =>
            SourceManager.get(source),
        )

        return new EnergyManager(sources)
    }

    static get(room: Room): EnergyManager {
        const name = room.name
        if (EnergyManager.cache.has(name)) {
            return EnergyManager.cache.get(name) as EnergyManager
        }
        const energyManager = EnergyManager.create(room.memory)
        SourceManager.cache.set(id, energyManager)
        return energyManager
    }

    findSourceAssignment(carryCapacity: number): Source<Id> | null {
        const source: SourceManager = maxBy(this.sources, s =>
            s.droppedEnergy.availableEnergy(),
        )

        if (source.droppedEnergy.availableEnergy() >= 2 * carryCapacity) {
            return source.id
        }
        return null
    }
}
