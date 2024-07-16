import { expect } from 'chai'

import { getStampExtants } from '../../../src/stamps/utils'
import { Stamp } from '../../../src/stamps/types'

describe('getStampExtants', () => {
    it('should return the extants of a stamp', () => {
        const stamp: Stamp = {
            rcl: 8,
            stationaryPoints: { storageLink: { x: 2, y: 3 } },
            buildings: {
                extension: [
                    { x: 2, y: 2 },
                    { x: 9, y: 4 },
                ],
                link: [{ x: 9, y: 5 }],
            },
        }

        const extants = getStampExtants(stamp)

        expect(extants).to.deep.equal({ top: 2, right: 9, bottom: 5, left: 2 })
    })
})
