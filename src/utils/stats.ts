if (!Memory.stats) {
    Memory.stats = {}
}

export function recordRoomStats(room: Room) {
    const prefix = `room.${room.name}`
    recordStatistic(`${prefix}.energyAvailable`, room.energyAvailable)
    recordStatistic(
        `${prefix}.energyCapacityAvailable`,
        room.energyCapacityAvailable,
    )
    if (!room.controller) {
        return
    }

    recordStatistic(`${prefix}.controller.progress`, room.controller.progress)
    recordStatistic(
        `${prefix}.controller.progressTotal`,
        room.controller.progressTotal,
    )
    recordStatistic(`${prefix}.controller.level`, room.controller.level)
}

export function recordGameStats() {
    recordStatistic('Game.cpu.limit', Game.cpu.limit)
    recordStatistic('Game.cpu.tickLimit', Game.cpu.tickLimit)
    recordStatistic('Game.cpu.bucket', Game.cpu.bucket)
    recordStatistic('Game.cpu.used', Game.cpu.getUsed())

    recordStatistic('Game.gcl.level', Game.gcl.level)
    recordStatistic('Game.gcl.progress', Game.gcl.progress)
    recordStatistic('Game.gcl.progressTotal', Game.gcl.progressTotal)

    recordStatistic('Game.gpl.level', Game.gpl.level)
    recordStatistic('Game.gpl.progress', Game.gpl.progress)
    recordStatistic('Game.gpl.progressTotal', Game.gpl.progressTotal)

    // the 2nd check is for sim
    if (!Game.cpu.getHeapStatistics || !Game.cpu.getHeapStatistics()) {
        return
    }

    for (const [k, v] of Object.entries(Game.cpu.getHeapStatistics())) {
        recordStatistic(`Game.heap.${k}`, v)
    }
}

export function recordStatistic(key: string, value: number) {
    Memory.stats[key] = value
}
