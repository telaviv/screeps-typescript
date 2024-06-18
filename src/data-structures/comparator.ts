export default class Comparator<K> {
    compare: (a: K, b: K) => number

    /**
     * @param {function(a: *, b: *)} [compareFunction]
     */
    constructor(compareFunction: (a: K, b: K) => number) {
        this.compare = compareFunction || Comparator.defaultCompareFunction
    }

    /**
     * @param {(string|number)} a
     * @param {(string|number)} b
     * @returns {number}
     */

    static defaultCompareFunction(a: any, b: any): number {
        if (a === b) {
            return 0
        }

        return a < b ? -1 : 1
    }

    equal(a: K, b: K): boolean {
        return this.compare(a, b) === 0
    }

    lessThan(a: K, b: K): boolean {
        return this.compare(a, b) < 0
    }

    greaterThan(a: K, b: K): boolean {
        return this.compare(a, b) > 0
    }

    lessThanOrEqual(a: K, b: K): boolean {
        return this.lessThan(a, b) || this.equal(a, b)
    }

    greaterThanOrEqual(a: K, b: K): boolean {
        return this.greaterThan(a, b) || this.equal(a, b)
    }

    reverse() {
        const compareOriginal = this.compare
        this.compare = (a, b) => compareOriginal(b, a)
    }
}
