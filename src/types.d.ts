interface CreepMemory {
    role: string
    home: string | undefined
    _dlPos?: string // Deadlock detection: serialized position from last tick
    _dlWait?: number // Deadlock detection: number of ticks waiting at same position
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

export interface FlatRoomPosition {
    x: number
    y: number
    roomName: string
}

declare global {
    interface RoomMemory {
        roadPositions: RoomPosition[]
        collapsed: boolean
        visuals: { snapshot: boolean }
        baseDefense?: {
            state: null | 'repair' // null = inactive, 'repair' = active defense mode
            repairTargets?: FlatRoomPosition[] // pre-computed repair target positions
        }
    }
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
