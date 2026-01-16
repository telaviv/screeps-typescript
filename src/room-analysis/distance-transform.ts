import { getSources, getWallPositions } from 'utils/room'
import { Position } from '../types'

/** Returns distance from walls for each position - used to find open spaces */
export function getWallTransform(roomTerrain: RoomTerrain, roomName: string): number[][] {
    const wallPositions = getWallPositions(roomTerrain, roomName)
    return distanceTransform(roomTerrain, wallPositions)
}

export function getTransformFromId(room: Room, id: Id<Source | StructureController>): number[][] {
    const obj = Game.getObjectById(id)
    if (!obj || !obj.pos.roomName) {
        throw new Error(`Object with ${id} not found for room ${room.name}`)
    }
    const roomTerrain = room.getTerrain()
    return distanceTransform(roomTerrain, [obj.pos])
}

/**
 * Sums distance transforms from all sources and controller.
 * Positions with lowest values are closest to all key structures - ideal for bunker placement.
 */
export function getSumTransform(room: Room): number[][] {
    const sources = getSources(room)
    const controller = room.controller
    const objs = [controller, ...sources].filter(Boolean) as (Source | StructureController)[]
    const transforms = objs.map((obj) => getTransformFromId(room, obj.id))
    return sumTransforms(transforms)
}

export function sumTransformsFromPositions(
    roomTerrain: RoomTerrain,
    positions: Position[],
): number[][] {
    const transforms = positions.map((pos) => distanceTransform(roomTerrain, [pos]))
    return sumTransforms(transforms)
}

function sumTransforms(transforms: number[][][]): number[][] {
    const width = 50
    const height = 50
    const sumTransform: number[][] = Array.from({ length: width }, () =>
        Array.from({ length: height }, () => 0),
    )

    for (const transform of transforms) {
        for (let x = 0; x < width; x++) {
            for (let y = 0; y < height; y++) {
                sumTransform[x][y] = sumTransform[x][y] + transform[x][y]
            }
        }
    }
    return sumTransform
}

/**
 * BFS-based distance transform: calculates minimum distance from each tile to any seed position.
 * Walls are set to Infinity. Used for base placement and pathfinding heuristics.
 */
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

export function getPositionsFromTransform(transform: number[][], minNumber: number): Position[] {
    const positions: Position[] = []
    for (let x = 0; x < 50; x++) {
        for (let y = 0; y < 50; y++) {
            if (transform[x][y] >= minNumber) {
                positions.push({ x, y })
            }
        }
    }
    return positions
}
