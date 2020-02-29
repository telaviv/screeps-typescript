import { mockGlobal, mockInstanceOf } from 'screeps-jest'

import DroppedEnergy from 'dropped-energy'
import { StrategyPhase } from 'strategy'

const ROOM_NAME = 'test'

const patchMemory = () => {
    const droppedEnergyMemory = mockInstanceOf<DroppedEnergyMemory>()
    const sourceMemory = mockInstanceOf<RoomSourceMemory>({
        dropSpot: droppedEnergyMemory,
    })
    const roomMemory = mockInstanceOf<RoomMemory>({
        strategy: StrategyPhase.DropMining,
        sources: [sourceMemory],
    })

    mockGlobal<Memory>('Memory', {
        creeps: {},
        rooms: { [ROOM_NAME]: roomMemory },
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
        })
    })
})
