export interface Stamp {
    rcl: number
    stationaryPoints: { storageLink: { x: number; y: number } }
    buildings: Record<string, { x: number; y: number }[]>
}

export interface StampExtants {
    left: number
    right: number
    top: number
    bottom: number
}

export interface StampMetadata {
    extants: StampExtants
    width: number
    height: number
}
