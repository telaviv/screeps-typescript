import { getObstacleAt } from 'utils/room'

const MATRIX_DEFAULT = 'default'
const MATRIX_NO_EDGES = 'no-edges'

type MatrixCacheType = typeof MATRIX_DEFAULT | typeof MATRIX_NO_EDGES

interface MatrixCache {
    [key: string]: { matrix: string; time: number }
}

declare global {
    interface RoomMemory {
        matrixCache?: MatrixCache
    }
}

function getHostiles(room: Room): { ranged: _HasRoomPosition[]; melee: _HasRoomPosition[] } {
    const hostiles = room.find(FIND_HOSTILE_CREEPS)
    return {
        ranged: hostiles.filter((creep) => creep.getActiveBodyparts(RANGED_ATTACK) > 0),
        melee: hostiles.filter(
            (creep) =>
                creep.getActiveBodyparts(ATTACK) > 0 &&
                creep.getActiveBodyparts(RANGED_ATTACK) === 0,
        ),
    }
}

function inRangeToHostiles(
    room: Room,
    x: number,
    y: number,
    ranged: _HasRoomPosition[],
    melee: _HasRoomPosition[],
): boolean {
    if (ranged.some((creep) => creep.pos.inRangeTo(x, y, 4))) {
        return true
    }
    if (melee.some((creep) => creep.pos.inRangeTo(x, y, 2))) {
        return true
    }
    return false
}

export class MatrixCacheManager {
    private room: Room

    constructor(room: Room) {
        this.room = room
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

    public getCostMatrix(key: MatrixCacheType): CostMatrix {
        this.ensureCache(key)
        return PathFinder.CostMatrix.deserialize(
            JSON.parse(this.matrixCache[key].matrix) as number[],
        )
    }

    public getSerializedMatrix(key: MatrixCacheType): number[] {
        this.ensureCache(key)
        return JSON.parse(this.matrixCache[key].matrix) as number[]
    }

    private ensureCache(key: MatrixCacheType): void {
        if (MATRIX_DEFAULT === key) {
            this.setDefaultMatrixCache()
        } else if (MATRIX_NO_EDGES === key) {
            this.setNoEdgesMatrixCache()
        }
    }

    public setDefaultMatrixCache(): void {
        if (this.matrixCache[MATRIX_DEFAULT]) {
            return
        }
        const matrix = Game.rooms[this.room.name]
            ? this.calculateDefaultMatrixCacheWithVision()
            : this.calculateMatrixCacheWithoutVision()
        this.matrixCache[MATRIX_DEFAULT] = {
            matrix: JSON.stringify(matrix.serialize()),
            time: Game.time,
        }
    }

    private calculateDefaultMatrixCacheWithVision(): CostMatrix {
        const terrain = new Room.Terrain(this.room.name)
        const harvesters = Object.values(Game.creeps).filter(
            (creep) => creep.memory.role === 'harvester' && creep.room.name === this.room.name,
        )
        const { ranged, melee } = getHostiles(this.room)
        const matrix = new PathFinder.CostMatrix()
        for (let x = 0; x < 50; x++) {
            for (let y = 0; y < 50; y++) {
                if (terrain.get(x, y) === TERRAIN_MASK_WALL) {
                    matrix.set(x, y, 255)
                } else {
                    const obstacle = getObstacleAt(this.room, x, y)
                    if (
                        obstacle ||
                        harvesters.some((creep) => creep.pos.x === x && creep.pos.y === y) ||
                        inRangeToHostiles(this.room, x, y, ranged, melee)
                    ) {
                        matrix.set(x, y, 255)
                    } else if (terrain.get(x, y) === TERRAIN_MASK_SWAMP) {
                        matrix.set(x, y, 5)
                    }
                }
            }
        }
        return matrix
    }

    private calculateMatrixCacheWithoutVision(): CostMatrix {
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

    public setNoEdgesMatrixCache(): void {
        if (this.matrixCache[MATRIX_NO_EDGES]) {
            return
        }
        const matrix = this.getCostMatrix(MATRIX_DEFAULT).clone()
        for (let x = 0; x < 50; x++) {
            matrix.set(x, 0, 255)
            matrix.set(x, 49, 255)
        }
        this.matrixCache[MATRIX_NO_EDGES] = {
            matrix: JSON.stringify(matrix.serialize()),
            time: Game.time,
        }
    }
}
