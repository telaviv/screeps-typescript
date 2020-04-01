import maxBy from 'lodash/maxBy'
import { LogisticsMemory, TASK_HAULING } from 'roles/logistics'

import SourceManager from './source-manager'

export default class EnergyManager {
    static readonly cache = new Map<string, EnergyManager>()
    readonly sources: SourceManager[]

    constructor(sources: SourceManager[]) {
        this.sources = sources
    }

    static create(memory: RoomMemory) {
        const sources: SourceManager[] = memory.sources.map(source =>
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
        EnergyManager.cache.set(name, energyManager)
        return energyManager
    }

    findSourceAssignment(carryCapacity: number): Id<Source> | null {
        if (this.sources.length === 0) {
            return null
        }

        const source: SourceManager = maxBy(this.sources, s =>
            s.droppedEnergy.availableEnergy(),
        ) as SourceManager

        if (source.droppedEnergy.availableEnergy() >= 2 * carryCapacity) {
            return source.id
        }
        return null
    }

    hasEnoughHaulers(): boolean {
        let creeps: Creep[] = []
        for (const source of this.sources) {
            creeps = creeps.concat(source.creeps)
        }
        const haulerCount = creeps.filter(creep => {
            const memory = creep.memory
            if (memory.role !== 'logistics') {
                return false
            }
            const logisticsMemory = memory as LogisticsMemory
            return logisticsMemory.preference === TASK_HAULING
        }).length

        return haulerCount >= this.sources.length
    }
}
