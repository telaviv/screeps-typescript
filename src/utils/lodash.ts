export function minBy<T>(arr: T[], by: (elem: T) => number): T {
    let minKey = arr[0]
    let minVal = by(minKey)
    for (const nKey of arr.slice(1)) {
        const nVal = by(nKey)
        if (nVal < minVal) {
            minKey = nKey
            minVal = nVal
        }
    }
    return minKey
}
