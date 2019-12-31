interface CreepMemory {
    role: string
}

interface SourceMemory extends CreepMemory {
    source: string
}

interface Memory {
    uuid: number
    log: any
}

interface RoomMemory {
    hasAssignedRoads: boolean
    sources: Array<{ id: string; harvest: RoomPosition }>
    strategy: StrategyPhase
}

type SpawnRunner = (spawn: StructureSpawn) => void

// `global` extension samples
declare namespace NodeJS {
    interface Global {
        log: any
    }
}
