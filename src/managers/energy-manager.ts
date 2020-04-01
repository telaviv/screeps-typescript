import maxBy from 'lodash/maxBy'
import minBy from 'lodash/minBy'
import { LogisticsMemory, TASK_HAULING } from 'roles/logistics'

import SourceManager from './source-manager'

type SourceCounts = Map<Id<Source>, number>

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

    forceSourceAssignment(role: string): Id<Source> {
        const sourceCounts = this.getSourceCounts(role)
        return minBy(Array.from(sourceCounts.keys()), id =>
            // eslint-disable-next-line @typescript-eslint/indent
            sourceCounts.get(id),
        ) as Id<Source>
    }

    private getSourceCounts(role: string): SourceCounts {
        const counts: SourceCounts = new Map<Id<Source>, number>()
        for (const source of this.sources) {
            let count = 0
            for (const creep of source.creeps) {
                if (creep.memory.role === role) {
                    count++
                }
            }
            counts.set(source.id, count)
        }
        return counts
    }
}
