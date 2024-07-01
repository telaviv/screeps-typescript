export const Game: {
    creeps: { [name: string]: any }
    rooms: any
    spawns: any
    time: any
    cpu: any
    gcl: any
    gpl: any
    flags: any
    map: any
    market: any
    powerCreeps: any
    resources: any
    structures: any
    constructionSites: any
    shard: any
    getObjectById: any
    notify: any
} = {
    creeps: {},
    rooms: [],
    spawns: {},
    time: 12345,
    cpu: { limit: 120, getUsed: () => 0 },
    gcl: { level: 1, progress: 0, progressTotal: 1000 },
    gpl: { level: 1, progress: 0, progressTotal: 1000 },
    flags: {},
    map: {},
    market: {},
    powerCreeps: {},
    resources: {},
    structures: {},
    constructionSites: {},
    shard: {},
    getObjectById: () => null,
    notify: () => OK,
}

export const Memory: {
    creeps: { [name: string]: any }
    stats: any
    rooms: any[]
} = {
    rooms: [],
    creeps: {},
    stats: {},
}
