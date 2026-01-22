import { sortBy } from 'lodash'

import * as Logger from './logger'
import { RoomType, findMyRooms, getRoomType } from './room'
import { profile } from './profiling'

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

/** Checks if any owned room is in a respawn area */
function isInRespawnArea(): boolean {
    const rooms = findMyRooms()
    return rooms.some((room) => Game.map.getRoomStatus(room.name).status === 'respawn')
}

/** Checks if room should be avoided: SK rooms, enemy-owned, wrong status, etc. */
function isRoomUnsafe(roomName: string): boolean {
    // Block highway rooms when in respawn area (highway rules differ in respawn)
    if (isInRespawnArea() && getRoomType(roomName) === RoomType.HIGHWAY) {
        Logger.debug(`isRoomUnsafe(${roomName}): highway room while in respawn area`)
        return true
    }

    /**
     * Let's try to trust Traveler
     * 
    const exitType = getRoomType(roomName)
    if ([RoomType.CENTER, RoomType.SOURCE_KEEPER].includes(exitType)) {
        Logger.debug(`isRoomUnsafe(${roomName}): CENTER/SK room`)
        return true
    }
    **/

    const status = currentStatusSearchSpace()
    const roomStatus = Game.map.getRoomStatus(roomName).status

    // If we're in normal areas, only allow normal rooms
    // If we're in respawn, allow both respawn and normal rooms
    if (status === 'normal' && roomStatus !== 'normal') {
        Logger.debug(
            `isRoomUnsafe(${roomName}): status mismatch (my: ${status}, room: ${roomStatus})`,
        )
        return true
    }

    const scout = Memory.rooms[roomName]?.scout

    if (!scout) {
        return false
    }

    if (scout.enemyThatsMining) {
        Logger.debug(`isRoomUnsafe(${roomName}): enemy mining`)
        return true
    }

    // not every room has a controller owner.
    // if it does, make sure it's not the enemys'
    if (scout.controllerOwner && scout.controllerOwner !== global.USERNAME) {
        if (scout.safeMode && scout.updatedAt + scout.safeMode > Game.time) {
            return false
        }
        Logger.debug(`isRoomUnsafe(${roomName}): enemy owned`)
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

/**
 * Wraps Game.map.describeExits to filter out exits blocked by respawn room walls.
 * Cleans up expired respawn data automatically.
 * @param roomName - The room to get exits for
 * @returns Exit information with respawn blocks filtered out
 */
function describeExitsWithRespawnBlocks(roomName: string): ExitsInformation {
    const exits = Game.map.describeExits(roomName)
    const scout = Memory.rooms[roomName]?.scout

    if (!scout || !scout.respawnBlocks || scout?.respawnBlocks.length === 0) {
        return exits
    }

    // Check if respawn period has expired
    if (scout.respawnRoomUntil !== undefined && Game.time > scout.respawnRoomUntil) {
        // Clean up expired respawn data
        delete scout.respawnRoomUntil
        delete scout.respawnBlocks
        return exits
    }

    // Filter out blocked exits
    const filteredExits = {} as ExitsInformation
    for (const [direction, exit] of Object.entries(exits)) {
        if (!scout.respawnBlocks.includes(direction)) {
            filteredExits[direction as keyof ExitsInformation] = exit
        }
    }

    return filteredExits
}

function safeDescribeExits(roomName: string): ExitsInformation {
    const exits = describeExitsWithRespawnBlocks(roomName)
    const exitCopy = {} as ExitsInformation
    const filtered: string[] = []

    for (const [direction, exit] of Object.entries(exits)) {
        if (isRoomUnsafe(exit)) {
            filtered.push(exit)
            continue
        }
        exitCopy[direction as keyof ExitsInformation] = exit
    }

    if (filtered.length > 0) {
        Logger.debug(`safeDescribeExits(${roomName}): filtered out ${filtered.join(', ')}`)
    }

    return exitCopy
}

export function safeRoomCallback(roomName: string): boolean {
    return !isRoomUnsafe(roomName)
}

/** World map utilities for finding rooms and calculating distances */
export class World {
    describeExits: (roomName: string) => ExitsInformation

    // eslint-disable-next-line @typescript-eslint/unbound-method
    constructor(describeExits: (roomName: string) => ExitsInformation = safeDescribeExits) {
        this.describeExits = describeExits
    }

    /** BFS to find all rooms within maxDistance, avoiding unsafe rooms */
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

    /** Finds the best owned room to handle a target, sorted by distance then progress */
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
