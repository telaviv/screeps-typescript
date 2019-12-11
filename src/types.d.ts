// example declaration file - remove these and add your own custom typings

// memory extension samples
interface CreepMemory {
    role: string
}

interface Memory {
    uuid: number
    log: any
}

interface RoomMemory {
    sources: Array<{ id: string }>
}

// `global` extension samples
declare namespace NodeJS {
    interface Global {
        log: any
    }
}
