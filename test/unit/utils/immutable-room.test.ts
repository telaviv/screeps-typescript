import { expect } from "chai";

import { ImmutableRoom, ImmutableRoomItem, fromRoom } from '../../../src/utils/immutable-room'

describe('immutable-room module', () => {
    describe('ImmutableRoom', () => {
        describe('#getCardinalNeighbors', () => {
            it('returns 4 cardinal neighbors', () => {
                const room = new ImmutableRoom('test')
                const genNeighbors = room.getCardinalNeighbors(1, 1)
                let neighbor: ImmutableRoomItem;

                neighbor = genNeighbors.next().value as ImmutableRoomItem // Add type assertion
                expect(neighbor).to.not.be.undefined
                expect(neighbor.x).to.equal(0)
                expect(neighbor.y).to.equal(1)

                neighbor = genNeighbors.next().value as ImmutableRoomItem
                expect(neighbor).to.not.be.undefined
                expect(neighbor.x).to.equal(2)
                expect(neighbor.y).to.equal(1)

                neighbor = genNeighbors.next().value as ImmutableRoomItem
                expect(neighbor).to.not.be.undefined
                expect(neighbor.x).to.equal(1)
                expect(neighbor.y).to.equal(0)

                neighbor = genNeighbors.next().value as ImmutableRoomItem
                expect(neighbor).to.not.be.undefined
                expect(neighbor.x).to.equal(1)
                expect(neighbor.y).to.equal(2)

                expect(genNeighbors.next().value).to.be.undefined
            })
        })

        describe('#nextExtensionPos', () => {
            it('picks a spot in the center of relevant buildings', () => {
                let immutableRoom = new ImmutableRoom('test')
                immutableRoom = immutableRoom.setObstacle(3, 3, 'controller')
                immutableRoom = immutableRoom.setObstacle(5, 5, 'spawn')

                const pos = immutableRoom.nextExtensionPos()

                expect(pos.x).to.equal(4)
                expect(pos.y).to.equal(4)
            })

            it("picks a nearby spot if there's an obstacle there", () => {
                let immutableRoom = new ImmutableRoom('test')
                immutableRoom = immutableRoom.setObstacle(3, 3, 'controller')
                immutableRoom = immutableRoom.setObstacle(5, 5, 'constructedWall')
                immutableRoom = immutableRoom.setObstacle(4, 4, 'spawn')

                const pos = immutableRoom.nextExtensionPos()

                expect(pos.x).to.equal(2)
                expect(pos.y).to.equal(4)
            })

            it('picks a nearby spot if the terrain is a wall', () => {
                let immutableRoom = new ImmutableRoom('test')
                immutableRoom = immutableRoom.setObstacle(3, 3, 'controller')
                immutableRoom = immutableRoom.setObstacle(5, 5, 'spawn')
                immutableRoom = immutableRoom.setTerrain(4, 4, TERRAIN_MASK_WALL)

                const pos = immutableRoom.nextExtensionPos()

                expect(pos.x).to.equal(3)
                expect(pos.y).to.equal(5)
            })

            it("picks a nearby spot if the there's a construction site", () => {
                let immutableRoom = new ImmutableRoom('test')
                immutableRoom = immutableRoom.setObstacle(3, 3, 'controller')
                immutableRoom = immutableRoom.setObstacle(5, 5, 'spawn')
                immutableRoom = immutableRoom.setConstructionSite(4, 4, true)

                const pos = immutableRoom.nextExtensionPos()

                expect(pos.x).to.equal(3)
                expect(pos.y).to.equal(5)
            })

            it("can't have cardinal obstacle neighbors", () => {
                let immutableRoom = new ImmutableRoom('test')
                immutableRoom = immutableRoom.setObstacle(3, 3, 'controller')
                immutableRoom = immutableRoom.setObstacle(5, 5, 'spawn')
                immutableRoom = immutableRoom.setTerrain(4, 3, TERRAIN_MASK_WALL)

                const pos = immutableRoom.nextExtensionPos()

                expect(pos.x).to.equal(3)
                expect(pos.y).to.equal(5)
            })
        })

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
                const room = new ImmutableRoom('test')
                const iter: Iterator<ImmutableRoomItem> = room.spiral(22, 22)

                for (const [x, y] of expectations) {
                    const roomItem = iter.next().value

                    expect(roomItem.x).to.equal(x)
                    expect(roomItem.y).to.equal(y)
                }
            })
        })
    })


    describe('ImmutableRoomItem', () => {
        describe("#canBuild", () => {
            it("is true if there's no obstacle", () => {
                const roomItem = new ImmutableRoomItem({
                    x: 1,
                    y: 1,
                    roomName: 'name',
                    terrain: 0,
                })
                expect(roomItem.canBuild()).to.equal(true)
            })
        })
    })
})
