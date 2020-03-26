import { fromJS, ValueObject, List, Map, Record } from 'immutable'
import times from 'lodash/times'
import range from 'lodash/range'
import includes from 'lodash/includes'

type Obstacle = typeof OBSTACLE_OBJECT_TYPES[number]

interface IImmutableRoomItem {
    x: number
    y: number
    terrain: number
    structures: Structure[]
    obstacle: Obstacle | ''
}

const ImmutableRoomItemRecord = Record({
    x: 0,
    y: 0,
    terrain: 0,
    structures: [] as Structure[],
    obstacle: '',
})

type RoomGrid = List<List<ImmutableRoomItem>>

export class ImmutableRoomItem extends ImmutableRoomItemRecord
    implements IImmutableRoomItem {
    readonly x!: number
    readonly y!: number
    readonly terrain!: number
    readonly structures!: Structure[]
    readonly obstacle!: Obstacle | ''

    isObstacle(): boolean {
        return !!this.obstacle || this.terrain === TERRAIN_MASK_WALL
    }
}

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

    getClosestNeighbors = function*(
        this: ImmutableRoom,
        x: number,
        y: number,
    ): Iterator<ImmutableRoomItem> {
        for (let nx = Math.max(0, x - 1); nx < Math.min(50, x + 1); ++nx) {
            for (let ny = Math.max(0, y - 1); ny < Math.min(50, y + 1); ++ny) {
                if (x !== nx && y !== ny) {
                    yield this.get(nx, ny)
                }
            }
        }
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
        if (roomItem.isObstacle()) {
            return false
        }

        for (const ri of this.getCardinalNeighbors(roomItem.x, roomItem.y)) {
            if (ri.isObstacle()) {
                return false
            }
        }
        return true
    }
}

export function fromRoom(room: Room): ImmutableRoom {
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

    const controller = room.controller
    const sources = room.find(FIND_SOURCES)
    const spawns = room.find(FIND_MY_SPAWNS)

    if (controller) {
        immutableRoom = immutableRoom.setObstacle(
            controller.pos.x,
            controller.pos.y,
            'controller',
        )
    }

    for (const source of sources) {
        const pos = source.pos
        immutableRoom = immutableRoom.setObstacle(pos.x, pos.y, 'source')
    }

    for (const source of spawns) {
        const pos = source.pos
        immutableRoom = immutableRoom.setObstacle(pos.x, pos.y, 'spawn')
    }

    return immutableRoom
}
