/* eslint @typescript-eslint/no-explicit-any: ["off"] */

interface CreepMemory {
    role: string
    home: string | undefined
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
    pos: FlatRoomPosition
}

interface SourceCreep extends Creep {
    memory: SourceMemory
}

interface ResourceCreepMemory extends CreepMemory {
    tasks: Task<any>[]
    waitTime: number
}

interface ResourceCreep extends Creep {
    memory: ResourceCreepMemory
}

interface ProfilerData {
    [key: string]: { total: number; calls: number }
}

interface ProfilerMemory {
    recording: boolean
    data: ProfilerData
    start?: number
}

interface StatsMemory {
    [key: string]: number
}

interface Memory {
    uuid: number
    log: any
    profiler: ProfilerMemory
    logLevel: string
    stats: StatsMemory
}

interface SurveyMemory {
    roads: RoomPositionSet
}

type RoomSnapshotMemory = Array<{
    pos: FlatRoomPosition
    structureType: StructureConstant
}>

interface FlatRoomPosition {
    x: number
    y: number
    roomName: string
}

interface RoomMemory {
    roadPositions: RoomPositionSet
    sources: RoomSourceMemory[]
    strategy: StrategyPhase
    survey: SurveyMemory
    collapsed: boolean
    snapshot: RoomSnapshotMemory
    visuals: { snapshot: boolean }
}

type RoomPositionSet = RoomPosition[]

type SpawnRunner = (spawn: StructureSpawn) => void

// `global` extension samples
declare namespace NodeJS {
    interface Global {
        Profiler: any
        log: any
        killAllCreeps: any
        setLogLevel: any
        saveSnapshot: any
        claimRoom: any
        visualizeRoom: any
        assignGlobals: any
        sendWrecker: any
        declareWar: any
        pauseConstruction: any
        unpauseConstruction: any
        resetSnapshot: any
        printTasks: any
        sendScout: any
    }
}

// Testing
interface MockRoom extends Room {
    addEnergy(x: number, y: number, amount: number): void
}
