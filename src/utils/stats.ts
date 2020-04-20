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
    if (room.controller) {
        recordStatistic(
            `${prefix}.controllerProgress`,
            room.controller.progress,
        )
    }
}

export function recordStatistic(key: string, value: number) {
    Memory.stats[key] = value
}
