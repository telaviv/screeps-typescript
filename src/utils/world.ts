import { RoomType, getRoomType } from './room'

export interface RoomDistanceInfo {
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

function isRoomUnsafe(roomName: string): boolean {
    const exitType = getRoomType(roomName)
    if ([RoomType.CENTER, RoomType.SOURCE_KEEPER].includes(exitType)) {
        return true
    }

    if (Game.map.getRoomStatus(roomName).status !== 'normal') {
        return true
    }

    if (Memory.rooms[roomName]?.scout?.enemyThatsMining) {
        return true
    }

    // not every room has a controller owner.
    // if it does, make sure it's not the enemys'
    if (Memory.rooms[roomName]?.scout?.controllerOwner) {
        if (Memory.rooms[roomName]?.scout?.controllerOwner !== global.USERNAME) {
            return true
        }
    }
    return false
}

function safeDescribeExits(roomName: string): ExitsInformation {
    const exits = Game.map.describeExits(roomName)
    const exitCopy = {} as ExitsInformation
    for (const [direction, exit] of Object.entries(exits)) {
        if (isRoomUnsafe(exit)) continue
        exitCopy[direction as keyof ExitsInformation] = exit
    }
    return exitCopy
}

export function safeRoomCallback(roomName: string): boolean {
    const safe = !isRoomUnsafe(roomName)
    return safe
}

export class World {
    describeExits: (roomName: string) => ExitsInformation

    // eslint-disable-next-line @typescript-eslint/unbound-method
    constructor(describeExits: (roomName: string) => ExitsInformation = safeDescribeExits) {
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

    getClosestRoom(start: string, end: string[], maxDistance: number): RoomDistanceInfo | null {
        const closestRooms = this.getClosestRooms([start], maxDistance)
        if (closestRooms.length === 0) return null
        const endSet = new Set(end)
        for (const { roomName, distance } of closestRooms) {
            if (endSet.has(roomName)) return { roomName, distance }
        }
        return null
    }

    findBestOwnedRoom(
        targetRoom: string,
        maxDistance: number,
        ownedRoomProgress: OwnedRoomProgress,
        opts?: { filter: (roomName: string) => boolean },
    ): string | null {
        const closestRooms = this.getClosestRooms([targetRoom], maxDistance)
        if (closestRooms.length === 0) return null
        const ownedRooms = Array.from(ownedRoomProgress.keys())
        const candidates = closestRooms.filter(({ roomName }) => {
            if (!ownedRooms.includes(roomName)) {
                return false
            }
            if (opts?.filter) {
                return opts.filter(roomName)
            }
            return true
        })
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
