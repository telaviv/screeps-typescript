import { fromJS, ValueObject, List, Record } from 'immutable'
import times from 'lodash/times'
import range from 'lodash/range'

const ImmutableRoomItemRecord = Record({
    x: 0,
    y: 0,
    terrain: 0,
    structure: null,
})

type RoomGrid = List<List<ImmutableRoomItem>>

export class ImmutableRoomItem extends ImmutableRoomItemRecord {}

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
