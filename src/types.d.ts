/* eslint @typescript-eslint/no-explicit-any: ["off"] */

interface CreepMemory {
    role: string
}

interface SourceMemory extends CreepMemory {
    source: string
}

interface RoomSourceMemory {
    id: string
    harvest: RoomPosition
    dropSpot: DroppedEnergyMemory
}

interface DroppedEnergyMemory {
    pos: RoomPosition
    requests: Id<Creep>[]
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
    roadPositions: RoomPositionSet
    sources: RoomSourceMemory[]
    strategy: StrategyPhase
}

type RoomPositionSet = RoomPosition[]

type SpawnRunner = (spawn: StructureSpawn) => void

// `global` extension samples
declare namespace NodeJS {
    interface Global {
        log: any
    }
}
