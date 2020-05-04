import maxBy from 'lodash/maxBy'
import minBy from 'lodash/minBy'
import { LogisticsMemory, TASK_HAULING } from 'roles/logistics-constants'

import SourceManager from './source-manager'

type SourceCounts = Map<Id<Source>, number>

export default class EnergyManager {
    readonly sources: SourceManager[]

    constructor(sources: SourceManager[]) {
        this.sources = sources
    }

    static create(memory: RoomMemory) {
        if (!memory.sources) {
            return new EnergyManager([])
        }

        const sources: SourceManager[] = memory.sources.map(source =>
            SourceManager.get(source),
        )

        return new EnergyManager(sources)
    }

    static get(room: Room): EnergyManager {
        return EnergyManager.create(room.memory)
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

    findLogisticsAssignment(carryCapacity: number): Id<Source> | null {
        if (this.sources.length === 0) {
            return null
        }

        const source: SourceManager = maxBy(this.sources, s =>
            s.droppedEnergy.availableEnergy(),
        ) as SourceManager

        if (source.droppedEnergy.availableEnergy() >= carryCapacity) {
            return source.id
        }
        return null
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
