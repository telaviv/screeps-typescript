import roleHarvester from 'roles/harvester'
import { runSpawn } from 'spawn'
import { mockGlobal, mockInstanceOf, mockStructure } from '../test/mocking'

jest.mock('roles/harvester')

describe('spawn module', () => {
    describe('runSpawn', () => {
        it('should continously create harvesters', () => {
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
