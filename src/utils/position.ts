import { Position } from '../types'

export function filterOutPositions(a: Position[], b: Position[]): Position[] {
    return a.filter((posA) => !b.some((posB) => posA.x === posB.x && posA.y === posB.y))
}
