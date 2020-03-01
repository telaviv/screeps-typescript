/* eslint @typescript-eslint/no-explicit-any: ["off"] */

import { mockGlobal, mockInstanceOf } from 'screeps-jest'

import { StrategyPhase } from 'strategy'

export const ROOM_NAME = 'test'

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

export const bootstrapGlobals = () => {
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
