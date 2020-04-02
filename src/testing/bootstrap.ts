/* eslint @typescript-eslint/no-explicit-any: ["off"] */

import { mockGlobal, mockInstanceOf } from 'screeps-jest'
import { v4 as uuidv4 } from 'uuid'

import { StrategyPhase } from 'strategy'
import { ROOM_NAME } from './constants'
import { createMockRoom } from './mocks/room'

export const bootstrapGlobals = () => {
    const sourceId = uuidv4() as Id<Source>
    const roomPosition = mockInstanceOf<RoomPosition>({
        x: 0,
        y: 0,
        roomName: ROOM_NAME,
        lookFor: () => [],
    })
    const droppedEnergyMemory = mockInstanceOf<DroppedEnergyMemory>({
        pos: roomPosition,
        requests: [],
    })
    const sourceMemory = mockInstanceOf<RoomSourceMemory>({
        id: sourceId,
        dropSpot: droppedEnergyMemory,
    })
    const roomMemory = mockInstanceOf<RoomMemory>({
        controller: { level: 2 },
        strategy: StrategyPhase.RCL_0,
        sources: [sourceMemory],
    })

    mockGlobal<Memory>('Memory', {
        profiler: { recording: false },
        rooms: { [ROOM_NAME]: roomMemory },
        creeps: {},
    })

    mockGlobal<Game>('Game', {
        cpu: { getUsed: () => 0 },
        time: 42,
        creeps: {},
        rooms: { [ROOM_NAME]: createMockRoom(roomPosition, roomMemory) },
        getObjectById: () => mockInstanceOf<Source>({ id: sourceId }),
    })
}
