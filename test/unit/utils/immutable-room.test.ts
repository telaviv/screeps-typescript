import { expect } from "chai";

import { ImmutableRoom, ImmutableRoomItem, fromRoom } from '../../../src/utils/immutable-room'

describe('immutable-room module', () => {
    describe('ImmutableRoom', () => {
        describe('#breadthFirst', () => {
            it('has length of the entire room', () => {
                const room = new ImmutableRoom('test')
                let count = 0
                for (const item of room.breadthFirst(0, 0)) {
                    expect(item).to.be.instanceOf(ImmutableRoomItem)
                    count++
                }
                expect(count).to.equal(50 * 50)
            })
        })

        describe('#getCardinalNeighbors', () => {
            it('returns 4 cardinal neighbors', () => {
                const room = new ImmutableRoom('test')
                const genNeighbors = room.getCardinalNeighbors(1, 1)
                let neighbor: ImmutableRoomItem;

                neighbor = genNeighbors.next().value as ImmutableRoomItem
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

        describe('#addExtensions', () => {
            it('adds extensions to the room up to the specified limit', () => {
                const room = new ImmutableRoom('test')
                const updatedRoom = room.addExtensions(5)

                expect(updatedRoom.getObstacles('extension')).to.have.lengthOf(5)
            })

            it('includes existing extensions in the count', () => {
                let room = new ImmutableRoom('test')
                room = room.setObstacle(1, 1, 'extension')
                room = room.setObstacle(2, 2, 'extension')

                const updatedRoom = room.addExtensions(5)

                expect(updatedRoom.getObstacles('extension')).to.have.lengthOf(5)
            })

            it('adds extensions to the room up to the default limit', () => {
                const room = new ImmutableRoom('test')
                const updatedRoom = room.addExtensions()

                expect(updatedRoom.getObstacles('extension')).to.have.lengthOf(60)
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
                expect(pos.y).to.equal(2)
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

        describe('#hasControllerLink', () => {
            beforeEach(() => {
                // @ts-ignore
                global.Game = {
                    rooms: {
                        test: {
                            controller: {
                                // @ts-ignore
                                pos: {
                                    x: 3,
                                    y: 3,
                                },
                            },
                        },
                    },
                }
            })

            it('returns false if the room has no link', () => {
                let room = new ImmutableRoom('test')
                room = room.setObstacle(3, 3, 'controller')

                const hasControllerLink = room.hasControllerLink()

                expect(hasControllerLink).to.be.false
            })

            it('returns false if the link is not near the controller', () => {
                let room = new ImmutableRoom('test')
                room = room.setObstacle(3, 3, 'controller')
                room = room.setObstacle(5, 5, 'link')

                const hasControllerLink = room.hasControllerLink()

                expect(hasControllerLink).to.be.false
            })

            it('returns true if the room does have a controller link', () => {
                let room = new ImmutableRoom('test')
                room = room.setObstacle(3, 3, 'controller')
                room = room.setObstacle(4, 4, 'link')

                const hasControllerLink = room.hasControllerLink()

                expect(hasControllerLink).to.be.true
            })
        })

        describe('#setStorage', () => {
            it('sets the storage position', () => {
                const room = new ImmutableRoom('test')
                const updatedRoom = room.setStorage()

                expect(updatedRoom.getObstacles('storage')).to.have.lengthOf(1)
            })

            it("doesn't set the storage position if there's already one", () => {
                let room = new ImmutableRoom('test')
                room = room.setObstacle(1, 1, 'storage')

                const updatedRoom = room.setStorage()
                const storage = updatedRoom.getObstacles('storage')[0]
                expect(storage.x).to.equal(1)
                expect(storage.y).to.equal(1)
            })
        })

        describe('#getObstacles', () => {
            it('returns an array of ImmutableRoomItem objects with the specified obstacle type', () => {
                let room = new ImmutableRoom('test')
                room = room.setObstacle(2, 2, 'constructedWall')
                room = room.setObstacle(3, 3, 'constructedWall')

                const obstacles = room.getObstacles('constructedWall')

                expect(obstacles).to.be.an('array')
                expect(obstacles).to.have.lengthOf(2)

                const obstacle1 = obstacles[0]
                expect(obstacle1).to.be.instanceOf(ImmutableRoomItem)
                expect(obstacle1.x).to.equal(2)
                expect(obstacle1.y).to.equal(2)
                expect(obstacle1.obstacle).to.equal('constructedWall')
                const obstacle2 = obstacles[1]
                expect(obstacle2).to.be.instanceOf(ImmutableRoomItem)
                expect(obstacle2.x).to.equal(3)
                expect(obstacle2.y).to.equal(3)
                expect(obstacle2.obstacle).to.equal('constructedWall')
            })

            it('returns an empty array if no obstacles of the specified type are found', () => {
                let room = new ImmutableRoom('test')
                room = room.setObstacle(1, 1, 'controller')
                room = room.setObstacle(2, 2, 'constructedWall')

                const obstacles = room.getObstacles('spawn')

                expect(obstacles).to.be.an('array')
                expect(obstacles).to.be.empty
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
