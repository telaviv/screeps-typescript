interface CreepMemory {
    role: string
}

interface Memory {
    uuid: number
    log: any
}

interface RoomMemory {
    hasAssignedRoads: boolean
    sources: Array<{ id: string }>
    strategy: StrategyPhase
}

// `global` extension samples
declare namespace NodeJS {
    interface Global {
        log: any
    }
}
