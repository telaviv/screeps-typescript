import { runSpawn } from 'spawn'
import { mockGlobal, mockInstanceOf, mockStructure } from '../test/mocking'

describe('spawn module', () => {
    describe('runSpawn', () => {
        it('should continously create harvesters', () => {
            mockGlobal<Game>('Game', {
                time: 1,
            })
            const tower = mockInstanceOf<StructureSpawn>({
                spawnCreep: () => OK,
            })
            runSpawn(tower)
            expect(tower.spawnCreep).toHaveBeenCalledWith(
                [WORK, CARRY, MOVE],
                'harvester:1',
                { memory: { role: 'harvester' } },
            )
        })
    })
})
