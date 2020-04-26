import { fromJS, ValueObject, List, Map, Record } from 'immutable'
import times from 'lodash/times'
import range from 'lodash/range'
import includes from 'lodash/includes'
import random from 'lodash/random'
import { wrap } from 'utils/profiling'

type Obstacle = typeof OBSTACLE_OBJECT_TYPES[number]

interface IImmutableRoomItem {
    x: number
    y: number
    terrain: number
    structures: Structure[]
    obstacle: Obstacle | ''
    hasConstructionSite: boolean
    hasRoad: boolean
}

const ImmutableRoomItemRecord = Record({
    x: 0,
    y: 0,
    terrain: 0,
    structures: [] as Structure[],
    obstacle: '',
    hasConstructionSite: false,
    hasRoad: false,
})

export class ImmutableRoomItem extends ImmutableRoomItemRecord
    implements IImmutableRoomItem {
    readonly x!: number
    readonly y!: number
    readonly terrain!: number
    readonly structures!: Structure[]
    readonly obstacle!: Obstacle | ''
    readonly hasRoad!: boolean

    isObstacle(): boolean {
        return !!this.obstacle || this.terrain === TERRAIN_MASK_WALL
    }

    canBuild(): boolean {
        return !(this.isObstacle() || this.hasConstructionSite)
    }
}

type RoomGrid = List<List<ImmutableRoomItem>>

export class ImmutableRoom implements ValueObject {
    private readonly grid: RoomGrid
    readonly name: string

    constructor(name: string, grid?: RoomGrid) {
        if (grid) {
            this.grid = grid
        } else {
            this.grid = fromJS(
                times(50, x =>
                    times(50, y => new ImmutableRoomItem({ x, y, terrain: 0 })),
                ),
            )
        }
        this.name = name
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    equals(other: any): boolean {
        return this.grid.equals(other)
    }

    hashCode(): number {
        return Map({ name: this.name, grid: this.grid }).hashCode()
    }

    get(x: number, y: number): ImmutableRoomItem {
        return this.grid.getIn([x, y])
    }

    set(x: number, y: number, item: ImmutableRoomItem): ImmutableRoom {
        return new ImmutableRoom(this.name, this.grid.setIn([x, y], item))
    }

    setTerrain(x: number, y: number, terrain: number): ImmutableRoom {
        const roomItem = this.get(x, y)
        return this.set(x, y, roomItem.set('terrain', terrain))
    }

    setObstacle(x: number, y: number, obstacle: Obstacle): ImmutableRoom {
        const roomItem = this.get(x, y)
        return this.set(x, y, roomItem.set('obstacle', obstacle))
    }

    setHasRoad(x: number, y: number, hasRoad: boolean): ImmutableRoom {
        const roomItem = this.get(x, y)
        return this.set(x, y, roomItem.set('hasRoad', hasRoad))
    }

    setConstructionSite(
        x: number,
        y: number,
        hasConstructionSite: boolean,
    ): ImmutableRoom {
        const roomItem = this.get(x, y)
        return this.set(
            x,
            y,
            roomItem.set('hasConstructionSite', hasConstructionSite),
        )
    }

    getRandomWalkablePosition(x: number, y: number): RoomPosition | null {
        const neighbors = this.getClosestNeighbors(x, y)
        const walkableNeighbors = neighbors.filter(pos => !pos.isObstacle())
        console.log(
            'walkable neighbors',
            x,
            y,
            JSON.stringify(walkableNeighbors),
        )
        if (walkableNeighbors.length === 0) {
            return null
        }
        const index = random(walkableNeighbors.length - 1)
        const roomItem = walkableNeighbors[index]
        return new RoomPosition(roomItem.x, roomItem.y, this.name)
    }

    getClosestNeighbors(x: number, y: number): ImmutableRoomItem[] {
        const neighbors = []
        for (let nx = Math.max(0, x - 1); nx < Math.min(50, x + 1); ++nx) {
            for (let ny = Math.max(0, y - 1); ny < Math.min(50, y + 1); ++ny) {
                if (x !== nx && y !== ny) {
                    neighbors.push(this.get(nx, ny))
                }
            }
        }
        return neighbors
    }

    getCardinalNeighbors = function*(
        this: ImmutableRoom,
        x: number,
        y: number,
    ): Generator<ImmutableRoomItem, void, unknown> {
        const deltas = [
            [-1, 0],
            [1, 0],
            [0, -1],
            [0, 1],
        ]
        for (const [dx, dy] of deltas) {
            const nx = x + dx
            const ny = y + dy
            if (nx >= 0 && nx < 50 && ny >= 0 && ny < 50) {
                yield this.get(nx, ny)
            }
        }
    }

    spiral = function*(
        this: ImmutableRoom,
        x: number,
        y: number,
    ): Generator<ImmutableRoomItem, void, unknown> {
        let nx = 0
        let ny = 0
        let dx = 0
        let dy = -1
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        for (const _ of range(2500)) {
            const px = x + nx
            const py = y + ny
            if (px >= 0 && px < 50 && py >= 0 && py < 50) {
                yield this.get(px, py)
            }
            if (
                nx === ny ||
                (nx < 0 && nx === -ny) ||
                (nx > 0 && nx === 1 - ny)
            ) {
                const temp = dx
                dx = -dy
                dy = temp
            }
            nx += dx
            ny += dy
        }
    }

    nextExtensionPos(): RoomPosition {
        const centroid = this.findCentroid()
        for (const roomItem of this.spiral(centroid.x, centroid.y)) {
            if (this.canPlaceExtension(roomItem)) {
                return new RoomPosition(roomItem.x, roomItem.y, this.name)
            }
        }
        throw new Error('No eligible extension spot.')
    }

    nextTowerPos(): RoomPosition {
        return this.nextExtensionPos()
    }

    private findCentroid(): RoomPosition {
        let xAcc = 0
        let yAcc = 0
        let count = 0
        for (const x of range(50)) {
            for (const y of range(50)) {
                if (
                    includes(
                        ['spawn', 'source', 'controller'],
                        this.get(x, y).obstacle,
                    )
                ) {
                    xAcc += x
                    yAcc += y
                    count++
                }
            }
        }
        const nx = Math.floor(xAcc / count)
        const ny = Math.floor(yAcc / count)
        return new RoomPosition(nx, ny, this.name)
    }

    private canPlaceExtension(roomItem: ImmutableRoomItem): boolean {
        if (!roomItem.canBuild()) {
            return false
        }

        for (const ri of this.getCardinalNeighbors(roomItem.x, roomItem.y)) {
            if (!ri.canBuild()) {
                return false
            }
        }
        return true
    }
}

interface RoomCache {
    [roomName: string]: ImmutableRoom
}
interface TimeCache {
    [time: number]: RoomCache
}
let cache: TimeCache = {}

export const fromRoom = wrap((room: Room, useCache = true): ImmutableRoom => {
    if (useCache) {
        if (cache.hasOwnProperty(Game.time)) {
            const timeCache = cache[Game.time]
            if (timeCache.hasOwnProperty(room.name)) {
                return timeCache[room.name]
            }
        } else if (!cache.hasOwnProperty(Game.time)) {
            cache = {}
            cache[Game.time] = {} as RoomCache
        }
    }
    let immutableRoom = new ImmutableRoom(room.name)
    const terrain = room.getTerrain()
    for (let x = 0; x < 50; ++x) {
        for (let y = 0; y < 50; ++y) {
            const terrainItem = terrain.get(x, y)
            if (terrainItem !== 0) {
                immutableRoom = immutableRoom.setTerrain(x, y, terrainItem)
            }
        }
    }

    interface StructureMap {
        [index: string]: Obstacle
    }

    const STRUCTURE_INFO: StructureMap = {
        [STRUCTURE_EXTENSION]: 'extension',
        [STRUCTURE_SPAWN]: 'spawn',
        [STRUCTURE_TOWER]: 'tower',
        [STRUCTURE_WALL]: 'constructedWall',
    }

    const controller = room.controller
    const structures = room.find(FIND_STRUCTURES)
    const sources = room.find(FIND_SOURCES)
    const constructionSites = room.find(FIND_CONSTRUCTION_SITES)

    if (controller) {
        immutableRoom = immutableRoom.setObstacle(
            controller.pos.x,
            controller.pos.y,
            'controller',
        )
    }

    for (const structure of structures) {
        if (includes(Object.keys(STRUCTURE_INFO), structure.structureType)) {
            const pos = structure.pos
            immutableRoom = immutableRoom.setObstacle(
                pos.x,
                pos.y,
                STRUCTURE_INFO[structure.structureType],
            )
        } else if (structure.structureType === STRUCTURE_ROAD) {
            const pos = structure.pos
            immutableRoom = immutableRoom.setHasRoad(pos.x, pos.y, true)
        }
    }

    for (const source of sources) {
        const pos = source.pos
        immutableRoom = immutableRoom.setObstacle(pos.x, pos.y, 'source')
    }

    for (const constructionSite of constructionSites) {
        const pos = constructionSite.pos
        immutableRoom = immutableRoom.setConstructionSite(pos.x, pos.y, true)
    }

    if (useCache) {
        updateCache(room, immutableRoom)
    }

    return immutableRoom
}, 'immutable-room:fromRoom')

export function updateCache(room: Room, immutableRoom: ImmutableRoom) {
    cache[Game.time][room.name] = immutableRoom
}
