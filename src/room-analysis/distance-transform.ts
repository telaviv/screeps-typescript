import { Position } from '../types'
import { getWallPositions } from 'utils/room'

export function getWallTransform(room: Room): number[][] {
    const roomTerrain = room.getTerrain()
    const wallPositions = getWallPositions(room)
    return distanceTransform(roomTerrain, wallPositions)
}

export function distanceTransform(roomTerrain: RoomTerrain, positions: Position[]): number[][] {
    const width = 50
    const height = 50

    // Initialize the distance matrix with maximum values
    const distanceMatrix: number[][] = Array.from({ length: width }, () =>
        Array.from({ length: height }, () => Infinity),
    )

    const queue: Position[] = [...positions]
    const visited: Set<string> = new Set()
    for (const { x, y } of positions) {
        queue.push({ x, y })
        visited.add(`${x}:${y}`)
        distanceMatrix[x][y] = 0
    }

    while (queue.length > 0) {
        const { x, y } = queue.shift() as Position

        for (let dx = -1; dx <= 1; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
                if (dx === 0 && dy === 0) {
                    continue
                }
                const nx = x + dx
                const ny = y + dy
                if (nx < 0 || nx >= width || ny < 0 || ny >= height) {
                    continue
                }
                if (visited.has(`${nx}:${ny}`)) {
                    continue
                }
                if (roomTerrain.get(nx, ny) === TERRAIN_MASK_WALL) {
                    distanceMatrix[nx][ny] = Infinity
                } else {
                    distanceMatrix[nx][ny] = distanceMatrix[x][y] + 1
                    queue.push({ x: nx, y: ny })
                }
                visited.add(`${nx}:${ny}`)
            }
        }
    }
    return distanceMatrix
}
