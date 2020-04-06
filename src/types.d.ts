/* eslint @typescript-eslint/no-explicit-any: ["off"] */

interface CreepMemory {
    role: string
}

interface SourceMemory extends CreepMemory {
    source: Id<Source>
    waitTime: number
}

interface RoomSourceMemory {
    id: string
    dropSpot: DroppedEnergyMemory
}

interface DroppedEnergyMemory {
    pos: RoomPosition
    requests: string[]
}

interface SourceCreep extends Creep {
    memory: SourceMemory
}

interface ProfilerData {
    [key: string]: { total: number; calls: number }
}

interface ProfilerMemory {
    recording: boolean
    data: ProfilerData
    start?: number
}

interface Memory {
    uuid: number
    log: any
    profiler: ProfilerMemory
}

interface SurveyMemory {
    roads: RoomPositionSet
}

interface RoomMemory {
    roadPositions: RoomPositionSet
    sources: RoomSourceMemory[]
    strategy: StrategyPhase
    survey: SurveyMemory
    collapsed: boolean
    constructing: boolean
}

interface CreepBlueprint {
    parts: BodyPartConstant[]
    name: string
    memory: CreepMemory
}

type RoomPositionSet = RoomPosition[]

type SpawnRunner = (spawn: StructureSpawn) => void

// `global` extension samples
declare namespace NodeJS {
    interface Global {
        Profiler: any
        log: any
    }
}

// Testing
interface MockRoom extends Room {
    addEnergy(x: number, y: number, amount: number): void
}
