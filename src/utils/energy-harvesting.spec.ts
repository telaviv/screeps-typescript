import { bootstrapGlobals } from 'testing/bootstrap'
import { createSourceCreep } from 'testing/mocks/creep'

import { getEnergy } from './energy-harvesting'

describe('energy-harvesting module', () => {
    describe('getEnergy', () => {
        it.skip('works', () => {
            bootstrapGlobals()
            const creep = createSourceCreep<SourceCreep>([CARRY])
            getEnergy(creep)
        })
    })
})
