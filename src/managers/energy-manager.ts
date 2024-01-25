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

        const sources: SourceManager[] = memory.sources.map((source) =>
            SourceManager.get(source),
        )

        return new EnergyManager(sources)
    }

    public static get(room: Room): EnergyManager {
        return EnergyManager.create(room.memory)
    }

    public forceSourceAssignment(role: string): Id<Source> {
        const sourceCounts = this.getSourceCounts(role)
        return minBy(Array.from(sourceCounts.keys()), (id) =>
            // eslint-disable-next-line @typescript-eslint/indent
            sourceCounts.get(id),
        ) as Id<Source>
    }

    private getSourceCounts(role: string): SourceCounts {
        const counts: SourceCounts = new Map<Id<Source>, number>()
        for (const source of this.sources) {
            let count = 0
            for (const creep of source.harvesters) {
                if (creep.memory.role === role) {
                    count++
                }
            }
            counts.set(source.id, count)
        }
        return counts
    }
}
