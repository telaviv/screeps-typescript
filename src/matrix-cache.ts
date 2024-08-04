import * as Logger from 'utils/logger'
import { getObstacles, getSources } from 'utils/room'
import { SubscriptionEvent } from 'pub-sub/constants'
import { getNeighbors } from 'utils/room-position'
import { getStationaryPoints } from 'construction-features'
import { subscribe } from 'pub-sub/pub-sub'

export type MatrixTag = 'no-edges' | 'no-sources' | 'no-obstacles' | 'no-stationary-points'
const TAG_ORDER: MatrixTag[] = ['no-edges', 'no-sources', 'no-obstacles', 'no-stationary-points']
const MATRIX_DEFAULT = 'default'
const MATRIX_CACHE_ID = 'matrix-cache'

interface MatrixCache {
    [key: string]: { matrix: string; time: number }
}

declare global {
    interface RoomMemory {
        matrixCache?: MatrixCache
    }
}

function tagsToKey(tags: MatrixTag[]): string {
    if (tags.length === 0) {
        return MATRIX_DEFAULT
    }
    const tagSet = new Set(tags)
    const sortedTags = TAG_ORDER.filter((tag) => tagSet.has(tag))
    return sortedTags.join(':')
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
                    Logger.error(
                        'caught event',
                        SubscriptionEvent.CONSTRUCTION_FEATURES_UPDATES,
                        roomName,
                    )
                },
            )
        }
    }

    public static getFullCostMatrix(roomName: string): CostMatrix {
        const manager = new MatrixCacheManager(roomName)
        return manager.getCostMatrix(TAG_ORDER)
    }

    public static getDefaultCostMatrix(roomName: string): CostMatrix {
        const manager = new MatrixCacheManager(roomName)
        return manager.getCostMatrix([])
    }

    public static clearCaches(): void {
        for (const roomMemory of Object.values(Memory.rooms)) {
            delete roomMemory.matrixCache
        }
    }

    private get matrixCache(): MatrixCache {
        if (!Memory.rooms[this.roomName].matrixCache) {
            Memory.rooms[this.roomName].matrixCache = {}
        }
        return Memory.rooms[this.roomName].matrixCache as MatrixCache
    }

    public getCostMatrix(tags: MatrixTag[]): CostMatrix {
        this.ensureCache(tags)
        const key = tagsToKey(tags)
        return PathFinder.CostMatrix.deserialize(
            JSON.parse(this.matrixCache[key].matrix) as number[],
        )
    }

    public getSerializedMatrix(tags: MatrixTag[]): number[] {
        this.ensureCache(tags)
        const key = tagsToKey(tags)
        return JSON.parse(this.matrixCache[key].matrix) as number[]
    }

    private ensureCache(tags: MatrixTag[]): void {
        if (tags.length === 0) {
            this.setDefaultMatrixCache()
            return
        }
        const key = tagsToKey(tags)
        if (this.matrixCache[key]) {
            return
        }
        const [prefix, latest] = splitTags(tags)
        const prefixMatrix = this.getCostMatrix(prefix).clone()
        if (latest === 'no-edges') {
            this.addEdges(prefixMatrix)
        } else if (latest === 'no-sources') {
            this.addSources(prefixMatrix)
        } else if (latest === 'no-obstacles') {
            this.addObstacles(prefixMatrix)
        } else if (latest === 'no-stationary-points') {
            this.addStationaryPoints(prefixMatrix)
        } else {
            throw new Error(`Unknown matrix tag: ${latest}`)
        }
        this.matrixCache[key] = {
            matrix: JSON.stringify(prefixMatrix.serialize()),
            time: Game.time,
        }
    }

    public setDefaultMatrixCache(): void {
        if (this.matrixCache[MATRIX_DEFAULT]) {
            return
        }
        const matrix = this.calculateDefaultMatrix()
        this.matrixCache[MATRIX_DEFAULT] = {
            matrix: JSON.stringify(matrix.serialize()),
            time: Game.time,
        }
    }

    private calculateDefaultMatrix(): CostMatrix {
        const terrain = new Room.Terrain(this.roomName)
        const matrix = new PathFinder.CostMatrix()
        for (let x = 0; x < 50; x++) {
            for (let y = 0; y < 50; y++) {
                if (terrain.get(x, y) === TERRAIN_MASK_WALL) {
                    matrix.set(x, y, 255)
                } else if (terrain.get(x, y) === TERRAIN_MASK_SWAMP) {
                    matrix.set(x, y, 5)
                }
            }
        }
        return matrix
    }

    private addEdges(matrix: CostMatrix): void {
        for (let x = 0; x < 50; x++) {
            matrix.set(x, 0, 255)
            matrix.set(x, 49, 255)
        }
        for (let y = 0; y < 50; y++) {
            matrix.set(0, y, 255)
            matrix.set(49, y, 255)
        }
    }

    private addSources(matrix: CostMatrix): void {
        const sources = getSources(this.room)
        for (const source of sources) {
            for (const neighbor of getNeighbors(source.pos)) {
                matrix.set(neighbor.x, neighbor.y, 255)
            }
        }
    }

    private addObstacles(matrix: CostMatrix): void {
        const obstacles = getObstacles(this.room)
        for (const obstacle of obstacles) {
            matrix.set(obstacle.pos.x, obstacle.pos.y, 255)
        }
    }

    private addStationaryPoints(matrix: CostMatrix): void {
        const points = getStationaryPoints(this.room)
        if (!points) {
            Logger.error('No stationary points found in room', this.room.name)
            return
        }
        const { sources, controllerLink, storageLink } = points
        matrix.set(controllerLink.x, controllerLink.y, 255)
        matrix.set(storageLink.x, storageLink.y, 255)
        for (const source of Object.values(sources)) {
            matrix.set(source.x, source.y, 255)
        }
    }
}
