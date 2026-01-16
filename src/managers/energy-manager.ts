import minBy from 'lodash/minBy'

import SourceManager from './source-manager'
import { getSources } from 'utils/room'

/** Map of source IDs to creep counts */
type SourceCounts = Map<Id<Source>, number>

/**
 * Manages energy source assignments across a room.
 * Balances creep assignments between multiple sources.
 */
export default class EnergyManager {
    /** Array of source managers for each source in the room */
    readonly sources: SourceManager[]

    /**
     * Creates a new EnergyManager.
     * @param sources - Array of SourceManager instances
     */
    constructor(sources: SourceManager[]) {
        this.sources = sources
    }

    /**
     * Creates an EnergyManager for a room.
     * @param room - The room to manage energy for
     */
    public static get(room: Room): EnergyManager {
        const sources = getSources(room)
        const sourceManagers = sources.map((source) => SourceManager.createFromSource(source))
        return new EnergyManager(sourceManagers)
    }

    /**
     * Assigns a creep to the source with the fewest creeps of that role.
     * @param role - The creep role to balance
     * @returns ID of the source with fewest assigned creeps
     */
    public forceSourceAssignment(role: string): Id<Source> {
        const sourceCounts = this.getSourceCounts(role)
        return minBy(Array.from(sourceCounts.keys()), (id) =>
            // eslint-disable-next-line @typescript-eslint/indent
            sourceCounts.get(id),
        ) as Id<Source>
    }

    /**
     * Counts creeps of a specific role assigned to each source.
     * @param role - The role to count
     * @returns Map of source IDs to creep counts
     */
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
