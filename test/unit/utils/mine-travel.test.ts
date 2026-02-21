import { assert } from 'chai'
import { MinePathEntry } from '../../../src/construction-features'
import {
    deltaToDirection,
    getMineRoomPathSteps,
    getOppositeDirection,
    getSourcePathKey,
    getSourceToSourceKey,
    isSourceToSourceReversed,
    reverseMinePath,
} from '../../../src/utils/mine-travel'

describe('mine-travel', () => {
    describe('deltaToDirection', () => {
        it('returns TOP for (0, -1)', () => assert.equal(deltaToDirection(0, -1), TOP))
        it('returns TOP_RIGHT for (1, -1)', () => assert.equal(deltaToDirection(1, -1), TOP_RIGHT))
        it('returns RIGHT for (1, 0)', () => assert.equal(deltaToDirection(1, 0), RIGHT))
        it('returns BOTTOM_RIGHT for (1, 1)', () =>
            assert.equal(deltaToDirection(1, 1), BOTTOM_RIGHT))
        it('returns BOTTOM for (0, 1)', () => assert.equal(deltaToDirection(0, 1), BOTTOM))
        it('returns BOTTOM_LEFT for (-1, 1)', () =>
            assert.equal(deltaToDirection(-1, 1), BOTTOM_LEFT))
        it('returns LEFT for (-1, 0)', () => assert.equal(deltaToDirection(-1, 0), LEFT))
        it('returns TOP_LEFT for (-1, -1)', () => assert.equal(deltaToDirection(-1, -1), TOP_LEFT))
    })

    describe('getOppositeDirection', () => {
        it('TOP ↔ BOTTOM', () => {
            assert.equal(getOppositeDirection(TOP), BOTTOM)
            assert.equal(getOppositeDirection(BOTTOM), TOP)
        })
        it('LEFT ↔ RIGHT', () => {
            assert.equal(getOppositeDirection(LEFT), RIGHT)
            assert.equal(getOppositeDirection(RIGHT), LEFT)
        })
        it('TOP_LEFT ↔ BOTTOM_RIGHT', () => {
            assert.equal(getOppositeDirection(TOP_LEFT), BOTTOM_RIGHT)
            assert.equal(getOppositeDirection(BOTTOM_RIGHT), TOP_LEFT)
        })
        it('TOP_RIGHT ↔ BOTTOM_LEFT', () => {
            assert.equal(getOppositeDirection(TOP_RIGHT), BOTTOM_LEFT)
            assert.equal(getOppositeDirection(BOTTOM_LEFT), TOP_RIGHT)
        })
    })

    describe('getMineRoomPathSteps', () => {
        const path: MinePathEntry[] = [
            { roomName: 'W1N8', x: 10, y: 20, dx: 1, dy: 0, direction: RIGHT },
            { roomName: 'W1N8', x: 11, y: 20, dx: 1, dy: 0, direction: RIGHT },
            { roomName: 'W2N8', x: 0, y: 20, dx: 1, dy: 0, direction: RIGHT },
            { roomName: 'W2N8', x: 1, y: 20, dx: 1, dy: 0, direction: RIGHT },
        ]

        it('filters to only entries matching roomName', () => {
            const steps = getMineRoomPathSteps(path, 'W2N8')
            assert.lengthOf(steps, 2)
            assert.deepEqual(steps[0], { x: 0, y: 20, dx: 1, dy: 0, direction: RIGHT })
            assert.deepEqual(steps[1], { x: 1, y: 20, dx: 1, dy: 0, direction: RIGHT })
        })

        it('returns empty array when no entries match', () => {
            assert.deepEqual(getMineRoomPathSteps(path, 'W3N8'), [])
        })

        it('strips roomName from returned PathStep objects', () => {
            const steps = getMineRoomPathSteps(path, 'W1N8')
            for (const step of steps) {
                assert.notProperty(step, 'roomName')
            }
        })
    })

    describe('reverseMinePath', () => {
        it('reverses a simple 3-step single-room path', () => {
            const path: MinePathEntry[] = [
                { roomName: 'W1N8', x: 5, y: 5, dx: 1, dy: 0, direction: RIGHT },
                { roomName: 'W1N8', x: 6, y: 5, dx: 0, dy: 1, direction: BOTTOM },
                { roomName: 'W1N8', x: 6, y: 6, dx: 0, dy: 0, direction: BOTTOM },
            ]
            const rev = reverseMinePath(path)
            assert.lengthOf(rev, 3)
            // Reversed positions
            assert.equal(rev[0].x, 6)
            assert.equal(rev[0].y, 6)
            assert.equal(rev[1].x, 6)
            assert.equal(rev[1].y, 5)
            assert.equal(rev[2].x, 5)
            assert.equal(rev[2].y, 5)
            // Directions point to next step in reversed order
            assert.equal(rev[0].direction, TOP) // (6,6) → (6,5) = dy=-1
            assert.equal(rev[1].direction, LEFT) // (6,5) → (5,5) = dx=-1
            // Last step direction is unused
        })

        it('does not mutate the original path', () => {
            const path: MinePathEntry[] = [
                { roomName: 'W1N8', x: 5, y: 5, dx: 1, dy: 0, direction: RIGHT },
                { roomName: 'W1N8', x: 6, y: 5, dx: 0, dy: 0, direction: RIGHT },
            ]
            reverseMinePath(path)
            assert.equal(path[0].x, 5)
            assert.equal(path[1].x, 6)
        })

        it('handles a single-entry path without throwing', () => {
            const path: MinePathEntry[] = [
                { roomName: 'W1N8', x: 5, y: 5, dx: 0, dy: 0, direction: TOP },
            ]
            const rev = reverseMinePath(path)
            assert.lengthOf(rev, 1)
            assert.equal(rev[0].x, 5)
        })
    })

    describe('getSourcePathKey', () => {
        it('returns the correct key format', () => {
            assert.equal(getSourcePathKey('W2N8', 'abc123'), 'storage:source-W2N8-abc123')
        })
    })

    describe('getSourceToSourceKey', () => {
        it('sorts ids alphabetically so the key is the same regardless of order', () => {
            const key1 = getSourceToSourceKey('W2N8', 'abc', 'xyz')
            const key2 = getSourceToSourceKey('W2N8', 'xyz', 'abc')
            assert.equal(key1, key2)
            assert.equal(key1, 'source-W2N8-abc:source-W2N8-xyz')
        })

        it('uses the lower id first', () => {
            assert.equal(
                getSourceToSourceKey('W1N8', 'zzz', 'aaa'),
                'source-W1N8-aaa:source-W1N8-zzz',
            )
        })
    })

    describe('isSourceToSourceReversed', () => {
        it('returns false when idA < idB (stored order)', () => {
            assert.isFalse(isSourceToSourceReversed('abc', 'xyz'))
        })

        it('returns true when idA > idB (reverse needed)', () => {
            assert.isTrue(isSourceToSourceReversed('xyz', 'abc'))
        })

        it('returns false when ids are equal', () => {
            assert.isFalse(isSourceToSourceReversed('abc', 'abc'))
        })
    })
})
