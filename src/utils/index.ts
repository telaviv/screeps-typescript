import { minBy } from 'utils/lodash'

interface SourceCounts {
    [index: string]: number
}

function getSourceCounts(room: Room, role: string): SourceCounts {
    const counts: SourceCounts = {}
    for (const source of room.memory.sources) {
        counts[source.id] = 0
    }
    for (const creep of Object.values(Memory.creeps)) {
        if (creep.role === role) {
            const harvesterMemory = creep as SourceMemory
            counts[harvesterMemory.source] += 1
        }
    }
    return counts
}

function getNextSource(room: Room, role: string): string {
    const sourceCounts = getSourceCounts(room, role)
    return minBy(Object.keys(sourceCounts), id => sourceCounts[id])
}

export { getSourceCounts }
