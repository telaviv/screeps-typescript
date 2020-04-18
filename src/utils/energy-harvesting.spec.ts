import { createSourceCreep } from 'testing/mocks/creep'

import { getEnergy } from './energy-harvesting'

describe.skip('energy-harvesting module', () => {
    describe('getEnergy', () => {
        it.skip('works', () => {
            // bootstrapGlobals()
            const creep = createSourceCreep<SourceCreep>([CARRY])
            getEnergy(creep)
        })
    })
})
