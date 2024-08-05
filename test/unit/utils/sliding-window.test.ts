import { expect } from 'chai'

import { SlidingWindowManager } from '../../../src/utils/sliding-window'

describe('SlidingWindowManager', () => {
    let slidingWindowManager: SlidingWindowManager

    it('should add values to the sliding window', () => {
        const slidingWindowManager = SlidingWindowManager.create(4, 0)
        slidingWindowManager.add(10, 1)
        slidingWindowManager.add(20, 2)
        slidingWindowManager.add(30, 3)

        expect(slidingWindowManager.sum()).to.equal(60)
        expect(slidingWindowManager.average()).to.equal(20)
    })

    it('should remove the oldest element when the window is full', () => {
        const slidingWindowManager = SlidingWindowManager.create(4, 0)

        slidingWindowManager.add(10, 1)
        slidingWindowManager.add(20, 2)
        slidingWindowManager.add(30, 3)
        slidingWindowManager.add(40, 4)

        expect(slidingWindowManager.sum()).to.equal(90)
        expect(slidingWindowManager.average()).to.equal(30)
    })
    it('should bundle the elements up', () => {
        const slidingWindowManager = SlidingWindowManager.create(11, 0)

        for (let i = 0; i < 10; i++) {
            slidingWindowManager.add(10, i + 1)
        }

        expect(slidingWindowManager.sum()).to.equal(100)
        expect(slidingWindowManager.average()).to.equal(10)
        expect(slidingWindowManager.window.elements).to.deep.equal({ 10: [100] })
    })
    it('should delete the elements when the time is not consecutive', () => {
        const slidingWindowManager = SlidingWindowManager.create(4, 0)

        slidingWindowManager.add(10, 1)
        slidingWindowManager.add(20, 3)

        expect(slidingWindowManager.sum()).to.equal(20)
        expect(slidingWindowManager.average()).to.equal(20)
        expect(slidingWindowManager.window.elements).to.deep.equal({ 1: [20] })
    })
    it('should delete the largest element when we have too many elements', () => {
        const slidingWindowManager = SlidingWindowManager.create(21, 0)

        for (let i = 0; i < 21; i++) {
            slidingWindowManager.add(10, i + 1)
        }

        expect(slidingWindowManager.sum()).to.equal(110)
        expect(slidingWindowManager.average()).to.equal(10)
        expect(slidingWindowManager.window.elements).to.deep.equal({ 10: [100], 1: [10] })
    })
})
