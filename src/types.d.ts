interface CreepMemory {
    role: string
    home: string | undefined
}

interface StatsMemory {
    [key: string]: number
}

interface Memory {
    uuid: number
    log: any
    logLevel: string
    stats: StatsMemory
}

interface RoomMemory {
    roadPositions: RoomPosition[]
    collapsed: boolean
    visuals: { snapshot: boolean }
}

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
        SourceManager: any
        SourcesManager: any
        getHarvesters: any
    }
}

// Testing
interface MockRoom extends Room {
    addEnergy(x: number, y: number, amount: number): void
}
