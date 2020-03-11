import { mockInstanceOf } from 'screeps-jest'

import { StrategyPhase } from 'strategy'
import { ROOM_NAME } from '../constants'

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

export const createMockRoom = (pos: RoomPosition, memory?: RoomMemory) => {
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
