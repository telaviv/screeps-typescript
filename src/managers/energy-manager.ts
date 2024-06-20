import minBy from 'lodash/minBy'

import SourceManager from './source-manager'
import { getSources } from 'utils/room'

type SourceCounts = Map<Id<Source>, number>

export default class EnergyManager {
    readonly sources: SourceManager[]

    constructor(sources: SourceManager[]) {
        this.sources = sources
    }

    public static get(room: Room): EnergyManager {
        const sources = getSources(room)
        const sourceManagers = sources.map((source) => SourceManager.createFromSource(source))
        return new EnergyManager(sourceManagers)
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
