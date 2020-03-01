/* eslint @typescript-eslint/no-explicit-any: ["off"] */

import { v4 as uuidv4 } from 'uuid'
import { mockGlobal, mockInstanceOf } from 'screeps-jest'

import DroppedEnergy from 'dropped-energy'
import { StrategyPhase } from 'strategy'

const ROOM_NAME = 'test'

interface MockRoom extends Room {
    addEnergy(x: number, y: number, amount: number): void
}

const createRoomArray = () => {
    const roomArray: number[][] = []
    for (let y = 0; y < 50; ++y) {
        roomArray.push([])
        for (let x = 0; x < 50; ++x) {
            roomArray[y].push(0)
        }
    }
    return roomArray
}

const createMockRoom = (pos: RoomPosition) => {
    const roomArray = createRoomArray()
    return mockInstanceOf<Room>({
        pos,
        addEnergy: (x: number, y: number, amount: number) => {
            roomArray[x][y] += amount
        },
        lookForAt: (_: any, npos: RoomPosition) => [
            { amount: roomArray[npos.x][npos.y] },
        ],
    })
}

const createCreep = (parts: BodyPartConstant[]) => {
    const id = uuidv4() as Id<Creep>
    return mockInstanceOf<Creep>({
        id,
        name: `creep:${id}`,
        store: {
            getCapacity: () => {
                return parts.reduce(
                    (acc, val) => (val === CARRY ? acc + CARRY_CAPACITY : acc),
                    0,
                )
            },
        },
    })
}

const patchMemory = () => {
    const roomPosition = new RoomPosition(0, 0, ROOM_NAME)
    const droppedEnergyMemory = mockInstanceOf<DroppedEnergyMemory>({
        pos: roomPosition,
        requests: [],
    })
    const sourceMemory = mockInstanceOf<RoomSourceMemory>({
        dropSpot: droppedEnergyMemory,
    })
    const roomMemory = mockInstanceOf<RoomMemory>({
        strategy: StrategyPhase.DropMining,
        sources: [sourceMemory],
    })

    mockGlobal<Memory>('Memory', {
        rooms: { [ROOM_NAME]: roomMemory },
    })

    mockGlobal<Game>('Game', {
        creeps: {},
        rooms: { [ROOM_NAME]: createMockRoom(roomPosition) },
    })
}

describe('dropped-energy module', () => {
    describe('DroppedEnergy', () => {
        describe('#availableEnergy', () => {
            it('equals 0 when no energy is provided', () => {
                patchMemory()
                const droppedEnergy = new DroppedEnergy(ROOM_NAME, 0)
                expect(droppedEnergy.availableEnergy()).toEqual(0)
            })

            it('equals the energy amount when energy is provided', () => {
                patchMemory()
                const room = Game.rooms[ROOM_NAME] as MockRoom
                room.addEnergy(0, 0, 50)

                const droppedEnergy = new DroppedEnergy(ROOM_NAME, 0)

                expect(droppedEnergy.availableEnergy()).toEqual(50)
            })

            it('is subtracted from the request amount', () => {
                patchMemory()
                const room = Game.rooms[ROOM_NAME] as MockRoom
                room.addEnergy(0, 0, 1000)
                const creep1 = createCreep([CARRY])
                const creep2 = createCreep([CARRY, CARRY])
                Game.creeps[creep1.name] = creep1
                Game.creeps[creep2.name] = creep2

                const droppedEnergy = new DroppedEnergy(ROOM_NAME, 0)
                droppedEnergy.request(creep1)

                expect(droppedEnergy.availableEnergy()).toEqual(
                    1000 - CARRY_CAPACITY,
                )

                droppedEnergy.request(creep2)

                expect(droppedEnergy.availableEnergy()).toEqual(
                    1000 - 3 * CARRY_CAPACITY,
                )
            })
        })
    })
})
