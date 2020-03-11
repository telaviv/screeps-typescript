import { mockInstanceOf } from 'screeps-jest'
import { ImmutableRoom, ImmutableRoomItem, fromRoom } from './immutable-room'

describe('immutable-room module', () => {
    describe('ImmutableRoom', () => {
        describe('#spiral()', () => {
            it('moves around in a spiral', () => {
                const expectations = [
                    [22, 22],
                    [23, 22],
                    [23, 23],
                    [22, 23],
                    [21, 23],
                    [21, 22],
                    [21, 21],
                    [22, 21],
                    [23, 21],
                    [24, 21],
                    [24, 22],
                    [24, 23],
                    [24, 24],
                    [23, 24],
                    [22, 24],
                    [21, 24],
                    [20, 24],
                ]
                const room = new ImmutableRoom()
                const iter: Iterator<ImmutableRoomItem> = room.spiral(22, 22)

                for (const [x, y] of expectations) {
                    const roomItem = iter.next().value
                    expect(roomItem.x).toEqual(x)
                    expect(roomItem.y).toEqual(y)
                }
            })
        })
    })

    describe('fromRoom', () => {
        it('tracks terrain correctly', () => {
            const terrain = mockInstanceOf<RoomTerrain>({
                get: (x: number, y: number) => {
                    if (x === 3 && y === 2) {
                        return TERRAIN_MASK_WALL
                    }
                    return 0
                },
            })
            const room = mockInstanceOf<Room>({ getTerrain: () => terrain })
            const immutableRoom = fromRoom(room)

            for (let x = 0; x < 50; ++x) {
                for (let y = 0; y < 50; ++y) {
                    const itemTerrain = immutableRoom.get(x, y).terrain
                    if (x === 3 && y === 2) {
                        expect(itemTerrain).toEqual(TERRAIN_MASK_WALL)
                    } else {
                        expect(itemTerrain).toEqual(0)
                    }
                }
            }
        })
    })
})
