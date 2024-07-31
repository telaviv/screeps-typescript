import { getSources } from 'utils/room'
import { getStationaryPoints } from 'surveyor'
import { getNeighbors } from 'utils/room-position'

type MatrixTag = 'no-edges' | 'no-sources' | 'no-stationary-points'
const TAG_ORDER: MatrixTag[] = ['no-edges', 'no-sources', 'no-stationary-points']
const MATRIX_DEFAULT = 'default'

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

export class MatrixCacheManager {
    private room: Room

    constructor(room: Room) {
        this.room = room
    }

    public static getFullCostMatrix(room: Room): CostMatrix {
        const manager = new MatrixCacheManager(room)
        return manager.getCostMatrix(TAG_ORDER)
    }

    public static clearCaches(): void {
        for (const roomMemory of Object.values(Memory.rooms)) {
            delete roomMemory.matrixCache
        }
    }

    private get matrixCache(): MatrixCache {
        if (!this.room.memory.matrixCache) {
            this.room.memory.matrixCache = {}
        }
        return this.room.memory.matrixCache
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
            this.addNoEdges(prefixMatrix)
        } else if (latest === 'no-sources') {
            this.addNoSources(prefixMatrix)
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
        const terrain = new Room.Terrain(this.room.name)
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

    private addNoEdges(matrix: CostMatrix): void {
        for (let x = 0; x < 50; x++) {
            matrix.set(x, 0, 255)
            matrix.set(x, 49, 255)
        }
        for (let y = 0; y < 50; y++) {
            matrix.set(0, y, 255)
            matrix.set(49, y, 255)
        }
    }

    private addNoSources(matrix: CostMatrix): void {
        const sources = getSources(this.room)
        for (const source of sources) {
            for (const neighbor of getNeighbors(source.pos)) {
                matrix.set(neighbor.x, neighbor.y, 255)
            }
        }
    }

    private addStationaryPoints(matrix: CostMatrix): void {
        const points = getStationaryPoints(this.room)
        if (!points) {
            throw new Error('No stationary points found for room: ' + this.room.name)
        }
        const { sources, controllerLink, storageLink } = points
        matrix.set(controllerLink.x, controllerLink.y, 255)
        matrix.set(storageLink.x, storageLink.y, 255)
        for (const source of Object.values(sources)) {
            matrix.set(source.x, source.y, 255)
        }
    }
}
