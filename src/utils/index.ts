interface SourceCounts {
    [index: string]: number
}

function getSourceCounts(room: Room): SourceCounts {
    const counts: SourceCounts = {}
    for (const source of room.memory.sources) {
        counts[source.id] = 0
    }
    for (const creep of Object.values(Memory.creeps)) {
        if (creep.role === 'harvester') {
            const harvesterMemory = creep as SourceMemory
            counts[harvesterMemory.source] += 1
        }
    }
    return counts
}

export { getSourceCounts }
