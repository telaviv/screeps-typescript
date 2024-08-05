/* eslint "@typescript-eslint/no-extra-semi": "off" */

const ARRAY_SIZE = 10

interface SlidingWindow {
    elements: Record<number, number[] | undefined>
    time: number
    maxSize: number
}

export class SlidingWindowManager {
    public window: SlidingWindow

    constructor(window: SlidingWindow) {
        this.window = window
    }

    public static create(maxSize = 999, time: null | number = null): SlidingWindowManager {
        if (time === null) {
            time = Game.time - 1
        }
        return new SlidingWindowManager({
            elements: {},
            time,
            maxSize,
        })
    }

    public add(value: number, time: number | null): void {
        if (time === null) {
            time = Game.time
        }
        if (this.window.time !== time - 1) {
            this.window.elements = {}
        }
        this.window.time = time
        let magnitude = 1
        if (this.window.elements[magnitude] === undefined) {
            this.window.elements[magnitude] = []
        }
        ;(this.window.elements[magnitude] as number[]).push(value)
        while (this.window.elements[magnitude]) {
            const array = this.window.elements[magnitude] as number[]
            if (array.length === ARRAY_SIZE) {
                const sum = array.reduce((acc, val) => acc + val, 0)
                if (this.window.elements[magnitude * ARRAY_SIZE] === undefined) {
                    this.window.elements[magnitude * ARRAY_SIZE] = []
                }
                ;(this.window.elements[magnitude * ARRAY_SIZE] as number[]).push(sum)
                delete this.window.elements[magnitude]
            }
            magnitude *= ARRAY_SIZE
        }
        if (this.calculateElementCount() > this.window.maxSize) {
            this.removeOldestElement()
        }
    }

    public sum(): number {
        let sum = 0
        for (const key of Object.keys(this.window.elements)) {
            const magnitude = Number(key)
            if (this.window.elements[magnitude]) {
                sum += (this.window.elements[magnitude] as number[]).reduce(
                    (acc, val) => acc + val,
                    0,
                )
            }
        }
        return sum
    }

    public getAverage(): number {
        return this.sum() / this.calculateElementCount()
    }

    private removeOldestElement(): void {
        const keys = Object.keys(this.window.elements)
            .map(Number)
            .sort((a, b) => b - a)
        this.window.elements[keys[0]]?.shift()
    }

    private calculateElementCount(): number {
        let count = 0
        if (this.window.elements === undefined) {
            return count
        }
        for (const key of Object.keys(this.window.elements)) {
            const magnitude = Number(key)
            if (this.window.elements[magnitude]) {
                count += (this.window.elements[magnitude] as number[]).length * magnitude
            }
        }
        return count
    }
}
