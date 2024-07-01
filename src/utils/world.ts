import { RoomType, getRoomType } from './room'

interface RoomDistanceInfo {
    roomName: string
    distance: number
}

export type OwnedRoomProgress = Map<string, number>

declare global {
    namespace NodeJS {
        interface Global {
            USERNAME: string
        }
    }
}

function safeDescribeExits(roomName: string): ExitsInformation {
    const exits = Game.map.describeExits(roomName)
    const exitCopy = {} as ExitsInformation
    for (const [direction, exit] of Object.entries(exits)) {
        const exitType = getRoomType(exit)
        if ([RoomType.CENTER, RoomType.SOURCE_KEEPER].includes(exitType)) {
            continue
        }
        // not every room has a controller owner.
        // if it does, make sure it's not the enemys'
        if (Memory.rooms[exit]?.scout?.controllerOwner) {
            if (Memory.rooms[exit]?.scout?.controllerOwner !== global.USERNAME) {
                continue
            }
        }
        exitCopy[direction as keyof ExitsInformation] = exit
    }
    return exitCopy
}

export class World {
    describeExits: (roomName: string) => ExitsInformation

    // eslint-disable-next-line @typescript-eslint/unbound-method
    constructor(
        describeExits: (roomName: string) => ExitsInformation = safeDescribeExits,
    ) {
        this.describeExits = describeExits
    }

    getClosestRooms(roomNames: string[], maxDistance: number): RoomDistanceInfo[] {
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
        ownedRoomProgress: OwnedRoomProgress,
    ): string | null {
        const closestRooms = this.getClosestRooms([targetRoom], maxDistance)
        if (closestRooms.length === 0) return null
        const ownedRooms = Array.from(ownedRoomProgress.keys())
        const candidates = closestRooms.filter(({ roomName }) => ownedRooms.includes(roomName))
        if (candidates.length === 0) return null
        candidates.sort(({ roomName: ar, distance: ad }, { roomName: br, distance: bd }) => {
            const roomAProgress = ownedRoomProgress.get(ar) ?? Infinity
            const roomBProgress = ownedRoomProgress.get(br) ?? Infinity
            if (ad !== bd) return ad - bd
            return roomBProgress - roomAProgress
        })
        return candidates[0].roomName
    }
}
