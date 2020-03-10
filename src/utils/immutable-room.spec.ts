import { ImmutableRoom, ImmutableRoomItem } from './immutable-room'

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
})
