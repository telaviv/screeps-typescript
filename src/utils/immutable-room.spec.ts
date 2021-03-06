import { mockInstanceOf } from 'screeps-jest'
import { bootstrapGlobals } from 'testing/bootstrap'
import { ImmutableRoom, ImmutableRoomItem, fromRoom } from './immutable-room'

function createRoom() {
    const terrain = mockInstanceOf<RoomTerrain>({
        get: () => 0,
    })

    return mockInstanceOf<Room>({
        name: 'test',
        controller: undefined,
        find: () => [],
        getTerrain: () => terrain,
    })
}

describe.skip('immutable-room module', () => {
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
                const room = new ImmutableRoom('test')
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
        beforeEach(() => {
            bootstrapGlobals()
        })
        it('tracks terrain correctly', () => {
            const terrain = mockInstanceOf<RoomTerrain>({
                get: (x: number, y: number) => {
                    if (x === 3 && y === 2) {
                        return TERRAIN_MASK_WALL
                    }
                    return 0
                },
            })
            const room = mockInstanceOf<Room>({
                name: 'test',
                controller: undefined,
                getTerrain: () => terrain,
                find: () => [],
            })
            const immutableRoom = fromRoom(room, false)

            let itemTerrain = immutableRoom.get(0, 0).terrain
            expect(itemTerrain).toEqual(0)

            itemTerrain = immutableRoom.get(3, 2).terrain
            expect(itemTerrain).toEqual(TERRAIN_MASK_WALL)
        })

        it('considers sources obstacles', () => {
            const room = createRoom()
            const source = mockInstanceOf<Source>({
                pos: new RoomPosition(3, 2, 'sim'),
            })
            room.find = (type: FindConstant) => {
                return type === FIND_SOURCES ? [source] : []
            }

            const immutableRoom = fromRoom(room, false)

            let itemTerrain = immutableRoom.get(0, 0)
            expect(itemTerrain.obstacle).toEqual('')

            itemTerrain = immutableRoom.get(3, 2)
            expect(itemTerrain.obstacle).toEqual('source')
        })

        it('considers spawns obstacles', () => {
            const room = createRoom()
            const spawn = mockInstanceOf<StructureSpawn>({
                structureType: STRUCTURE_SPAWN,
                pos: new RoomPosition(3, 2, 'sim'),
            })
            room.find = (type: FindConstant) => {
                return type === FIND_STRUCTURES ? [spawn] : []
            }

            const immutableRoom = fromRoom(room, false)

            let itemTerrain = immutableRoom.get(0, 0)
            expect(itemTerrain.obstacle).toEqual('')

            itemTerrain = immutableRoom.get(3, 2)
            expect(itemTerrain.obstacle).toEqual('spawn')
        })

        it('considers controllers obstacles', () => {
            const room = createRoom()
            const controller = mockInstanceOf<StructureController>({
                pos: new RoomPosition(3, 2, 'sim'),
            })
            room.controller = controller

            const immutableRoom = fromRoom(room, false)

            let itemTerrain = immutableRoom.get(0, 0)
            expect(itemTerrain.obstacle).toEqual('')

            itemTerrain = immutableRoom.get(3, 2)
            expect(itemTerrain.obstacle).toEqual('controller')
        })
    })

    describe('nextExtensionPos', () => {
        it('picks a spot in the center of relevant buildings', () => {
            let immutableRoom = new ImmutableRoom('test')
            immutableRoom = immutableRoom.setObstacle(0, 0, 'controller')
            immutableRoom = immutableRoom.setObstacle(2, 2, 'spawn')

            const pos = immutableRoom.nextExtensionPos()

            expect(pos.x).toEqual(1)
            expect(pos.y).toEqual(1)
        })

        it("picks a nearby spot if there's an obstacle there", () => {
            let immutableRoom = new ImmutableRoom('test')
            immutableRoom = immutableRoom.setObstacle(0, 0, 'controller')
            immutableRoom = immutableRoom.setObstacle(1, 1, 'constructedWall')
            immutableRoom = immutableRoom.setObstacle(2, 2, 'spawn')

            const pos = immutableRoom.nextExtensionPos()

            expect(pos.x).toEqual(0)
            expect(pos.y).toEqual(2)
        })

        it('picks a nearby spot if the terrain is a wall', () => {
            let immutableRoom = new ImmutableRoom('test')
            immutableRoom = immutableRoom.setObstacle(0, 0, 'controller')
            immutableRoom = immutableRoom.setObstacle(2, 2, 'spawn')
            immutableRoom = immutableRoom.setTerrain(1, 1, TERRAIN_MASK_WALL)

            const pos = immutableRoom.nextExtensionPos()

            expect(pos.x).toEqual(0)
            expect(pos.y).toEqual(2)
        })

        it("picks a nearby spot if the there's a construction site", () => {
            let immutableRoom = new ImmutableRoom('test')
            immutableRoom = immutableRoom.setObstacle(0, 0, 'controller')
            immutableRoom = immutableRoom.setObstacle(2, 2, 'spawn')
            immutableRoom = immutableRoom.setConstructionSite(1, 1, true)

            const pos = immutableRoom.nextExtensionPos()

            expect(pos.x).toEqual(0)
            expect(pos.y).toEqual(2)
        })

        it("can't have cardinal obstacle neighbors", () => {
            let immutableRoom = new ImmutableRoom('test')
            immutableRoom = immutableRoom.setObstacle(0, 0, 'controller')
            immutableRoom = immutableRoom.setObstacle(2, 2, 'spawn')
            immutableRoom = immutableRoom.setTerrain(1, 0, TERRAIN_MASK_WALL)

            const pos = immutableRoom.nextExtensionPos()

            expect(pos.x).toEqual(0)
            expect(pos.y).toEqual(2)
        })
    })
})
