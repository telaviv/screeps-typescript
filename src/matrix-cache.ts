/* eslint-disable no-bitwise */

import * as Logger from 'utils/logger'
import { getStationaryPoints, isStationaryBase } from 'construction-features'
import { mprofile, profile, wrap } from 'utils/profiling'
import { SubscriptionEvent } from 'pub-sub/constants'
import { getObstacles } from 'utils/room'
import hash from 'utils/hash'
import { subscribe } from 'pub-sub/pub-sub'

export type MatrixTag = 'default-terrain' | 'road-preferred-terrain' | 'no-edges' | 'no-obstacles'
const TAG_ORDER: MatrixTag[] = [
    'default-terrain',
    'road-preferred-terrain',
    'no-edges',
    'no-obstacles',
]
const MATRIX_CACHE_ID = 'matrix-cache'
const DEPRECATED_TAGS: MatrixTag[] = []
const EVICTION_TIME = 2500

interface TerrainCosts {
    swamp: number
    plain: number
}
const DEFAULT_TERRAIN_COSTS: TerrainCosts = { swamp: 10, plain: 2 }
const ROAD_PREFERRED_TERRAIN_COSTS: TerrainCosts = { swamp: 5, plain: 4 }
const ROAD_COST = 1
const WALL_COST = 255

interface MatrixCache {
    [key: string]: { matrix: string; time: number }
}

declare global {
    interface RoomMemory {
        matrixCache?: MatrixCache
    }

    namespace NodeJS {
        interface Global {
            matrix: { clear: () => void; keys: () => void }
        }
    }
}

const tagsToKey = wrap((tags: MatrixTag[]): string => {
    if (tags.length === 0) {
        throw new Error('Cannot convert empty tags to key')
    }
    const tagSet = new Set(tags)
    const sortedTags = TAG_ORDER.filter((tag) => tagSet.has(tag))
    return sortedTags.join(':')
}, 'matrix-cache:tagsToKey')

function keyToTags(key: string): MatrixTag[] {
    return key.split(':') as MatrixTag[]
}

function splitTags(tags: MatrixTag[]): [MatrixTag[], MatrixTag | null] {
    const copy = tags.slice()
    const latest = copy.pop()
    return [copy, latest ?? null]
}

export function printMatrix(matrix: CostMatrix): void {
    const rows = []
    for (let y = 0; y < 50; y++) {
        const row = []
        for (let x = 0; x < 50; x++) {
            const val = matrix.get(x, y)
            row.push(val === 255 ? 'x' : val.toString())
        }
        rows.push(row.join(''))
    }
    Logger.error('\n' + rows.join('\n'))
}

export class MatrixCacheManager {
    private roomName: string

    constructor(roomName: string) {
        this.roomName = roomName
    }

    get room(): Room {
        return Game.rooms[this.roomName]
    }

    public static addSubscriptions(): void {
        for (const [roomName, { matrixCache }] of Object.entries(Memory.rooms)) {
            if (!matrixCache) {
                continue
            }
            subscribe(
                SubscriptionEvent.CONSTRUCTION_FEATURES_UPDATES,
                roomName,
                MATRIX_CACHE_ID,
                () => {
                    Logger.info(
                        'caught event',
                        SubscriptionEvent.CONSTRUCTION_FEATURES_UPDATES,
                        roomName,
                    )
                },
            )
        }
    }

    @mprofile('MatrixCacheManager.getFullCostMatrix')
    public static getRoomMatrix(roomName: string, roadPreferred = false): CostMatrix {
        const manager = new MatrixCacheManager(roomName)
        const keys: MatrixTag[] = roadPreferred
            ? ['road-preferred-terrain', 'no-edges', 'no-obstacles']
            : ['default-terrain', 'no-edges', 'no-obstacles']
        return manager.getCostMatrix(keys)
    }

    @mprofile('MatrixCacheManager.getRoomTravelMatrix')
    public static getTravelMatrix(roomName: string, roadPreferred = false): CostMatrix {
        const manager = new MatrixCacheManager(roomName)
        const keys: MatrixTag[] = roadPreferred
            ? ['road-preferred-terrain', 'no-obstacles']
            : ['default-terrain', 'no-obstacles']
        const cm = manager.getCostMatrix(keys)
        return cm
    }

    @mprofile('MatrixCacheManager.getDefaultCostMatrix')
    public static getDefaultCostMatrix(roomName: string): CostMatrix {
        const manager = new MatrixCacheManager(roomName)
        return manager.getCostMatrix([])
    }

    @mprofile('MatrixCacheManager.clearCaches')
    public static clearCaches(clearAll = false): void {
        for (const [roomName, roomMemory] of Object.entries(Memory.rooms)) {
            for (const key of Object.keys(roomMemory.matrixCache ?? {})) {
                if (!roomMemory.matrixCache || !roomMemory.matrixCache[key as keyof MatrixCache]) {
                    continue
                }
                if (clearAll) {
                    delete roomMemory.matrixCache[key as keyof MatrixCache]
                    continue
                }
                const time = roomMemory.matrixCache[key as keyof MatrixCache].time
                if (Game.time - time > EVICTION_TIME && hash(`${roomName}:${key}`) % 100 === 0) {
                    delete roomMemory.matrixCache[key as keyof MatrixCache]
                } else if (DEPRECATED_TAGS.some((tag) => keyToTags(key).includes(tag))) {
                    delete roomMemory.matrixCache[key as keyof MatrixCache]
                } else if (
                    [
                        tagsToKey(['default-terrain']),
                        tagsToKey(['default-terrain', 'no-edges']),
                    ].includes(key)
                ) {
                    continue
                } else if (keyToTags(key).includes('no-obstacles')) {
                    delete roomMemory.matrixCache[key as keyof MatrixCache]
                } else if (hash(`${roomName}:${key}`) % 100 === 0) {
                    delete roomMemory.matrixCache[key as keyof MatrixCache]
                }
            }
        }
    }

    private get matrixCache(): MatrixCache {
        if (!Memory.rooms[this.roomName]) {
            throw new Error(`No memory for room ${this.roomName}`)
        }
        if (!Memory.rooms[this.roomName].matrixCache) {
            Memory.rooms[this.roomName].matrixCache = {}
        }
        return Memory.rooms[this.roomName].matrixCache as MatrixCache
    }

    @profile
    public getCostMatrix(tags: MatrixTag[]): CostMatrix {
        this.ensureCache(tags)
        const key = tagsToKey(tags)
        return PathFinder.CostMatrix.deserialize(
            JSON.parse(this.matrixCache[key].matrix) as number[],
        )
    }

    @profile
    public getSerializedMatrix(tags: MatrixTag[]): number[] {
        if (tags.length === 0) {
            throw new Error('Cannot get matrix with empty tags')
        }
        this.ensureCache(tags)
        const key = tagsToKey(tags)
        return JSON.parse(this.matrixCache[key].matrix) as number[]
    }

    @profile
    private ensureCache(tags: MatrixTag[]): void {
        if (tags.length === 0) {
            throw new Error('Cannot get matrix with empty tags')
        }
        const key = tagsToKey(tags)
        if (this.matrixCache[key]) {
            return
        }
        const [prefix, latest] = splitTags(tags)
        let prefixMatrix =
            prefix.length === 0 ? new PathFinder.CostMatrix() : this.getCostMatrix(prefix)
        if (latest === 'default-terrain') {
            prefixMatrix = this.calculateTerrain(DEFAULT_TERRAIN_COSTS, prefixMatrix)
        } else if (latest === 'road-preferred-terrain') {
            prefixMatrix = this.calculateTerrain(ROAD_PREFERRED_TERRAIN_COSTS, prefixMatrix)
        } else if (latest === 'no-edges') {
            prefixMatrix = this.addEdges(prefixMatrix)
        } else if (latest === 'no-obstacles') {
            prefixMatrix = this.addObstacles(prefixMatrix)
        } else {
            throw new Error(`Unknown matrix tag: ${latest}`)
        }
        this.matrixCache[key] = {
            matrix: JSON.stringify(prefixMatrix.serialize()),
            time: Game.time,
        }
    }

    @profile
    public addObstacles(matrix: CostMatrix): CostMatrix {
        if (!this.room) {
            return matrix
        }
        matrix = matrix.clone()
        matrix = this.addBuildings(matrix)
        matrix = this.addRoads(matrix)
        matrix = this.addStationaryPoints(matrix)
        matrix = this.addCreeps(matrix)
        return matrix
    }

    @profile
    private calculateTerrain(costs: TerrainCosts, matrix: CostMatrix): CostMatrix {
        const terrain = new Room.Terrain(this.roomName)
        for (let x = 0; x < 50; x++) {
            for (let y = 0; y < 50; y++) {
                if (terrain.get(x, y) === TERRAIN_MASK_WALL) {
                    matrix.set(x, y, WALL_COST)
                } else if (terrain.get(x, y) === TERRAIN_MASK_SWAMP) {
                    matrix.set(x, y, costs.swamp)
                } else {
                    matrix.set(x, y, costs.plain)
                }
            }
        }
        return matrix
    }

    @profile
    private addEdges(matrix: CostMatrix): CostMatrix {
        matrix = matrix.clone()
        for (let x = 0; x < 50; x++) {
            matrix.set(x, 0, 255)
            matrix.set(x, 49, 255)
        }
        for (let y = 0; y < 50; y++) {
            matrix.set(0, y, 255)
            matrix.set(49, y, 255)
        }
        return matrix
    }

    @profile
    private addBuildings(matrix: CostMatrix): CostMatrix {
        if (!this.room) {
            return matrix
        }
        const obstacles = getObstacles(this.room)
        for (const obstacle of obstacles) {
            matrix.set(obstacle.pos.x, obstacle.pos.y, 255)
        }
        const constructionSites = this.room.find(FIND_CONSTRUCTION_SITES)
        for (const site of constructionSites) {
            matrix.set(site.pos.x, site.pos.y, 255)
        }
        return matrix
    }

    @profile
    private addRoads(matrix: CostMatrix): CostMatrix {
        if (!this.room) {
            return matrix
        }
        const roads = this.room.find(FIND_STRUCTURES, {
            filter: (s) => s.structureType === STRUCTURE_ROAD,
        })
        for (const road of roads) {
            matrix.set(road.pos.x, road.pos.y, ROAD_COST)
        }
        return matrix
    }

    @profile
    private addCreeps(matrix: CostMatrix): CostMatrix {
        if (!this.room) {
            return matrix
        }
        const creeps = this.room.find(FIND_CREEPS)
        for (const creep of creeps) {
            matrix.set(creep.pos.x, creep.pos.y, 255)
        }
        return matrix
    }

    @profile
    private addStationaryPoints(matrix: CostMatrix): CostMatrix {
        const points = getStationaryPoints(this.roomName)
        if (!points) {
            return matrix
        }
        for (const source of Object.values(points.sources)) {
            matrix.set(source.x, source.y, 255)
        }
        if (isStationaryBase(points)) {
            matrix.set(points.controllerLink.x, points.controllerLink.y, 255)
            matrix.set(points.storageLink.x, points.storageLink.y, 255)
        }
        return matrix
    }
}

function clearAllCaches(): void {
    MatrixCacheManager.clearCaches(true)
}

global.matrix = {
    clear: clearAllCaches,
    keys: (): void => {
        const descriptions: string[] = []
        for (const [roomName, roomMemory] of Object.entries(Memory.rooms)) {
            for (const key of Object.keys(roomMemory.matrixCache ?? {})) {
                descriptions.push(`${roomName}: ${key}`)
            }
        }
        descriptions.sort()
        console.log('matrix-cache key count: ', descriptions.length)
        for (const description of descriptions) {
            console.log(description)
        }
    },
}
