import { RoomType, findMyRooms, getRoomType } from './room'
import { profile } from './profiling'
import { sortBy } from 'lodash'
import * as Logger from './logger'

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

const CLOSEST_ROOM_CACHE_TTL = 10000
const CLOSEST_ROOM_CACHE: Map<string, { time: number; info: RoomDistanceInfo[] }> = new Map()

function isRoomUnsafe(roomName: string): boolean {
    const exitType = getRoomType(roomName)
    if ([RoomType.CENTER, RoomType.SOURCE_KEEPER].includes(exitType)) {
        return true
    }

    const status = currentStatusSearchSpace()
    if (Game.map.getRoomStatus(roomName).status !== status) {
        return true
    }

    const scout = Memory.rooms[roomName]?.scout

    if (!scout) {
        return false
    }

    if (scout.enemyThatsMining) {
        return true
    }

    // not every room has a controller owner.
    // if it does, make sure it's not the enemys'
    if (scout.controllerOwner && scout.controllerOwner !== global.USERNAME) {
        if (scout.safeMode && scout.updatedAt + scout.safeMode > Game.time) {
            return false
        }
        return true
    }
    return false
}


function currentStatusSearchSpace(): 'normal' | 'respawn' {
    const rooms = findMyRooms()
    if (Game.map.getRoomStatus(rooms[0].name).status === 'respawn') {
        return 'respawn'
    }
    return 'normal'
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
    return !isRoomUnsafe(roomName)
}

export class World {
    describeExits: (roomName: string) => ExitsInformation

    // eslint-disable-next-line @typescript-eslint/unbound-method
    constructor(describeExits: (roomName: string) => ExitsInformation = safeDescribeExits) {
        this.describeExits = describeExits
    }

    @profile
    getClosestRooms(roomNames: string[], maxDistance: number): RoomDistanceInfo[] {
        const cacheKey = World.getClosestRoomCacheKey(roomNames, maxDistance)
        if (CLOSEST_ROOM_CACHE.has(cacheKey)) {
            return (CLOSEST_ROOM_CACHE.get(cacheKey) as { time: number; info: RoomDistanceInfo[] })
                .info
        }
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
        CLOSEST_ROOM_CACHE.set(cacheKey, { time: Game.time, info: results })
        return results
    }

    private static getClosestRoomCacheKey(roomNames: string[], maxDistance: number): string {
        const sorted = sortBy(roomNames)
        return `${sorted.join()}:${maxDistance}`
    }

    public static clearClosestRoomCache(): void {
        for (const [key, { time }] of CLOSEST_ROOM_CACHE) {
            if (Game.time - time > CLOSEST_ROOM_CACHE_TTL) {
                CLOSEST_ROOM_CACHE.delete(key)
            }
        }
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
