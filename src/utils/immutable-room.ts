import { fromJS, ValueObject, List, Record } from 'immutable'
import times from 'lodash/times'
import range from 'lodash/range'

const ImmutableRoomItemRecord = Record({
    x: 0,
    y: 0,
    terrain: 0,
    structures: [],
    obstacle: null,
})

type RoomGrid = List<List<ImmutableRoomItem>>

export class ImmutableRoomItem extends ImmutableRoomItemRecord {
    isObstacle(): boolean {
        return !!this.obstacle && this.terrain !== TERRAIN_MASK_WALL
    }
}

export class ImmutableRoom implements ValueObject {
    private readonly grid: RoomGrid

    constructor(grid?: RoomGrid) {
        if (grid) {
            this.grid = grid
        } else {
            this.grid = fromJS(
                times(50, x =>
                    times(50, y => new ImmutableRoomItem({ x, y, terrain: 0 })),
                ),
            )
        }
    }

    equals(other: any): boolean {
        return this.grid.equals(other)
    }

    hashCode(): number {
        return this.grid.hashCode()
    }

    get(x: number, y: number): ImmutableRoomItem {
        return this.grid.getIn([x, y])
    }

    set(x: number, y: number, item: ImmutableRoomItem): ImmutableRoom {
        return new ImmutableRoom(this.grid.setIn([x, y], item))
    }

    setTerrain(x: number, y: number, terrain: number): ImmutableRoom {
        const roomItem = this.get(x, y)
        return this.set(x, y, roomItem.set('terrain', terrain))
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

    spiral = function*(
        this: ImmutableRoom,
        x: number,
        y: number,
    ): Iterator<ImmutableRoomItem> {
        let nx = 0
        let ny = 0
        let dx = 0
        let dy = -1
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
}

export function fromRoom(room: Room): ImmutableRoom {
    let immutableRoom = new ImmutableRoom()
    const terrain = room.getTerrain()
    for (let x = 0; x < 50; ++x) {
        for (let y = 0; y < 50; ++y) {
            const terrainItem = terrain.get(x, y)
            if (terrainItem !== 0) {
                immutableRoom = immutableRoom.setTerrain(x, y, terrainItem)
            }
        }
    }
    return immutableRoom
}
