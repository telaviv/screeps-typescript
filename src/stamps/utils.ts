import { Stamp, StampExtants, StampMetadata } from './types'

export function getStampExtants(stamp: Stamp): StampExtants {
    const extants: StampExtants = { left: 49, right: 0, top: 49, bottom: 0 }
    for (const building of Object.values(stamp.buildings)) {
        for (const { x, y } of building) {
            if (x < extants.left) {
                extants.left = x
            }
            if (x > extants.right) {
                extants.right = x
            }
            if (y < extants.top) {
                extants.top = y
            }
            if (y > extants.bottom) {
                extants.bottom = y
            }
        }
    }
    return extants
}

export function getStampMetadata(stamp: Stamp): StampMetadata {
    const extants = getStampExtants(stamp)
    return {
        extants,
        width: extants.right - extants.left + 1,
        height: extants.bottom - extants.top + 1,
    }
}
