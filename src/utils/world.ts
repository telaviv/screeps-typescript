interface RoomDistanceInfo {
    roomName: string
    distance: number
}

export class World {
    describeExits: (roomName: string) => ExitsInformation

    // eslint-disable-next-line @typescript-eslint/unbound-method
    constructor(describeExits: (roomName: string) => ExitsInformation = Game.map.describeExits) {
        this.describeExits = describeExits
    }

    getClosestRooms(
        roomNames: string[],
        maxDistance: number,
    ): RoomDistanceInfo[] {
        const distanceQueue: RoomDistanceInfo[] = roomNames.map((roomName) => ({
            roomName,
            distance: 0,
        }))
        const visited = new Set<string>(roomNames)
        const results: RoomDistanceInfo[] = []

        while (distanceQueue.length > 0) {
            const { roomName, distance } = distanceQueue.shift() as RoomDistanceInfo
            const exits = this.describeExits(roomName)

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

    findBestOwnedRoom(
        targetRoom: string,
        maxDistance: number,
        ownedRoomProgress: Map<string, number> | null = null,
    ): string | null {
        if (ownedRoomProgress === null) {
            ownedRoomProgress = new Map<string, number>()
            for (const roomName in Game.rooms) {
                ownedRoomProgress.set(roomName, Game.rooms[roomName].controller?.level ?? 0)
            }
        }
        const closestRooms = this.getClosestRooms([targetRoom], maxDistance)
        if (closestRooms.length === 0) return null
        const ownedRooms = Array.from(ownedRoomProgress.keys())
        const candidates = closestRooms.filter(
            ({ roomName, distance }) =>
                distance === closestRooms[0].distance && ownedRooms.includes(roomName),
        )
        if (candidates.length === 0) return null
        candidates.sort(
            (a, b) =>
                (ownedRoomProgress?.get(b.roomName) ?? 0) -
                (ownedRoomProgress?.get(a.roomName) ?? 0),
        )
        return candidates[0].roomName
    }
}
