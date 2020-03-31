/* eslint no-loop-func: "off" */

import filter from 'lodash/filter'
import { calculateParts } from './harvester'

describe('calculateParts()', () => {
    it('produces the correct amount of parts', () => {
        const checks = [
            { capacity: 200, work: 1, move: 1 },
            { capacity: 250, work: 1, move: 1 },
            { capacity: 300, work: 2, move: 2 },
            { capacity: 350, work: 2, move: 2 },
            { capacity: 400, work: 2, move: 2 },
            { capacity: 450, work: 3, move: 3 },
            { capacity: 500, work: 3, move: 3 },
        ]

        for (const { capacity, work, move } of checks) {
            const parts = calculateParts(capacity)
            const works = filter(parts, p => p === WORK)
            const moves = filter(parts, p => p === MOVE)
            expect(works.length).toEqual(work)
            expect(moves.length).toEqual(move)
        }
    })
})
