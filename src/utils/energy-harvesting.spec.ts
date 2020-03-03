import { bootstrapGlobals } from 'testing/bootstrap'
import createCreep from 'testing/mocks/creep'

import { getEnergy } from './energy-harvesting'

describe('energy-harvesting module', () => {
    describe('getEnergy', () => {
        it.skip('works', () => {
            bootstrapGlobals()
            const creep = createCreep([CARRY])
            getEnergy(creep)
        })
    })
})
