import { bootstrapGlobals } from 'testing/bootstrap'
import { unwrappedLoop } from './main'

jest.mock('surveyor')

describe('main loop', () => {
    it('should run', () => {
        bootstrapGlobals()
        unwrappedLoop()
    })
})
