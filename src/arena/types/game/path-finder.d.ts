export declare class CostMatrix {
    constructor()
    set(x: number, y: number, cost: number): void
    get(x: number, y: number): number
    clone(): CostMatrix
}

export interface PathFinderPath {
    path: { x: number; y: number }[]
    ops: number
    cost: number
    incomplete: boolean
}

export interface PathFinderGoal {
    pos: { x: number; y: number }
    range: number
}

export interface PathFinderOptions {
    costMatrix?: CostMatrix
    maxOps?: number
    maxRooms?: number
}

export declare function searchPath(
    origin: { x: number; y: number },
    goal: PathFinderGoal,
    options?: PathFinderOptions,
): PathFinderPath
