import range from 'lodash/range'
import times from 'lodash/times'
import { mockInstanceOf } from 'screeps-jest'

import { bootstrapGlobals } from 'testing/bootstrap'
import { createLogisticsCreep } from 'testing/mocks/creep'

import EnergyManager from './energy-manager'
import SourceManager from './source-manager'

function createSourceManager(id: Id<Source>, haulerCount: number) {
    const creeps = times(haulerCount, () => {
        const creep = createLogisticsCreep([CARRY])
        creep.memory.source = id
        return creep
    }) as SourceCreep[]

    return mockInstanceOf<SourceManager>({ creeps })
}

function createSourceManagers(haulerCounts: number[]) {
    const sources: SourceManager[] = []
    for (const i of range(haulerCounts.length)) {
        const id = String(i) as Id<Source>
        sources.push(createSourceManager(id, haulerCounts[i]))
    }
    return sources
}

describe('EnergyManager', () => {
    describe('hasEnoughHaulers()', () => {
        beforeEach(() => {
            bootstrapGlobals()
        })

        it('is true if we have at least 1 hauler per source', () => {
            const combinations = [[0, 1, 2], [1], [3], [1, 1, 1], [4, 0, 0]]
            for (const counts of combinations) {
                const sources = createSourceManagers(counts)
                const energyManager = new EnergyManager(sources)
                expect(energyManager.hasEnoughHaulers()).toBe(true)
            }
        })
    })
})
