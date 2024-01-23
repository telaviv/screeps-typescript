/* eslint no-loop-func: "off" */

import filter from 'lodash/filter'

import { calculateParts } from './logistics'

describe('calculateParts()', () => {
    it('produces the correct amount of parts', () => {
        const checks = [
            { capacity: 300, work: 1, carry: 1, move: 2 },
            { capacity: 350, work: 1, carry: 1, move: 2 },
            { capacity: 400, work: 1, carry: 1, move: 2 },
            { capacity: 450, work: 1, carry: 1, move: 2 },
            { capacity: 500, work: 2, carry: 2, move: 4 },
            { capacity: 550, work: 2, carry: 2, move: 4 },
            { capacity: 600, work: 2, carry: 2, move: 4 },
        ]

        for (const { capacity, work, move, carry } of checks) {
            const parts = calculateParts(capacity)
            const works = filter(parts, (p) => p === WORK)
            const moves = filter(parts, (p) => p === MOVE)
            const carrys = filter(parts, (p) => p === CARRY)
            expect(works.length).toEqual(work)
            expect(moves.length).toEqual(move)
            expect(carrys.length).toEqual(carry)
        }
    })
})
