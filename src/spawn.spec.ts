import roleHarvester from 'roles/logistics'
import { runSpawn } from 'spawn'
import { mockGlobal, mockInstanceOf } from 'screeps-jest'
import { StrategyPhase } from 'strategy'

jest.mock('roles/logistics')

describe('spawn module', () => {
    describe('runSpawn', () => {
        it.skip('should continously create logisticss', () => {
            mockGlobal<Game>('Game', {
                time: 1,
            })
            const spawn = mockInstanceOf<StructureSpawn>({
                spawnCreep: () => OK,
                room: { memory: { strategy: StrategyPhase.DropMining } },
            })
            runSpawn(spawn)
            expect(roleHarvester.create).toHaveBeenCalledWith(spawn)
        })
    })
})
