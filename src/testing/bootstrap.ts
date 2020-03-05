/* eslint @typescript-eslint/no-explicit-any: ["off"] */

import { mockGlobal, mockInstanceOf } from 'screeps-jest'
import { v4 as uuidv4 } from 'uuid'

import { StrategyPhase } from 'strategy'
import { ROOM_NAME } from './constants'

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

const createMockRoom = (pos: RoomPosition, memory?: RoomMemory) => {
    const roomArray = createRoomArray()
    const roomMemory =
        memory ||
        mockInstanceOf<RoomMemory>({
            strategy: StrategyPhase.DropMining,
        })
    return mockInstanceOf<Room>({
        pos,
        addEnergy: (x: number, y: number, amount: number) => {
            roomArray[x][y] += amount
        },
        find: () => [],
        lookForAt: (_: any, npos: RoomPosition) => [
            { amount: roomArray[npos.x][npos.y] },
        ],
        memory: roomMemory,
        name: ROOM_NAME,
        controller: mockInstanceOf<StructureController>({ my: true }),
    })
}

export const bootstrapGlobals = () => {
    const sourceId = uuidv4() as Id<Source>
    const roomPosition = new RoomPosition(0, 0, ROOM_NAME)
    const droppedEnergyMemory = mockInstanceOf<DroppedEnergyMemory>({
        pos: roomPosition,
        requests: [],
    })
    const sourceMemory = mockInstanceOf<RoomSourceMemory>({
        id: sourceId,
        dropSpot: droppedEnergyMemory,
    })
    const roomMemory = mockInstanceOf<RoomMemory>({
        strategy: StrategyPhase.DropMining,
        sources: [sourceMemory],
    })

    mockGlobal<Memory>('Memory', {
        rooms: { [ROOM_NAME]: roomMemory },
        creeps: {},
    })

    mockGlobal<Game>('Game', {
        creeps: {},
        rooms: { [ROOM_NAME]: createMockRoom(roomPosition, roomMemory) },
        getObjectById: () => mockInstanceOf<Source>({ id: sourceId }),
    })
}
