interface CreepMemory {
    role: string
}

interface SourceMemory extends CreepMemory {
    source: string
}

interface RoomSourceMemory {
    id: string
    harvest: RoomPosition
}

interface SourceCreep extends Creep {
    memory: SourceMemory
}

interface Memory {
    uuid: number
    log: any
}

interface RoomMemory {
    hasAssignedRoads: boolean
    sources: RoomSourceMemory[]
    strategy: StrategyPhase
}

type SpawnRunner = (spawn: StructureSpawn) => void

// `global` extension samples
declare namespace NodeJS {
    interface Global {
        log: any
    }
}
