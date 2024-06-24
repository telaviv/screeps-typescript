interface RoomDistanceInfo {
    roomName: string;
    distance: number
}

export function getClosestRooms(
    roomNames: string[],
    maxDistance: number,
    describeExits?: (roomName: string) => ExitsInformation | null,
): RoomDistanceInfo[] {
    // eslint-disable-next-line @typescript-eslint/unbound-method
    const describeExitsFn = describeExits || Game.map.describeExits
    const distanceQueue: RoomDistanceInfo[] = roomNames.map((roomName) => ({
        roomName,
        distance: 0,
    }))
    const visited = new Set<string>(roomNames)
    const results: RoomDistanceInfo[] = []

    while (distanceQueue.length > 0) {
        const { roomName, distance } = distanceQueue.shift() as RoomDistanceInfo
        const exits = describeExitsFn(roomName)

        if (exits === null) continue

        for (const exit of Object.values(exits)) {
            if (visited.has(exit)) continue
            visited.add(exit)

            if (distance + 1 <= maxDistance) {
                const roomDistance = { roomName: exit, distance: distance + 1 }
                distanceQueue.push(roomDistance)
                results.push(roomDistance)
            }
        }
    }
    return results
}
