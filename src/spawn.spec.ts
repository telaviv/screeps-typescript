import roleHarvester from 'roles/logistics'
import { runSpawn } from 'spawn'
import { mockGlobal, mockInstanceOf, mockStructure } from '../test/mocking'

jest.mock('roles/logistics')

describe('spawn module', () => {
    describe('runSpawn', () => {
        it('should continously create logisticss', () => {
            mockGlobal<Game>('Game', {
                time: 1,
            })
            const spawn = mockInstanceOf<StructureSpawn>({
                spawnCreep: () => OK,
            })
            runSpawn(spawn)
            expect(roleHarvester.create).toHaveBeenCalledWith(spawn)
        })
    })
})
