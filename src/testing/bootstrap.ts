/* eslint @typescript-eslint/no-explicit-any: ["off"] */

import { mockGlobal, mockInstanceOf } from 'screeps-jest'
import { v4 as uuidv4 } from 'uuid'

import { StrategyPhase } from 'strategy'
import { ROOM_NAME } from './constants'
import { createMockRoom } from './mocks/room'

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
