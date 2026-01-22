import * as PF from 'pathfinding'
import { Position } from '../types'

/**
 * Options for pathfinding
 */
export interface FindPathOptions {
    range?: number // Distance from goal (0 = exact, 1 = adjacent, etc.)
    maxOps?: number // Maximum pathfinding operations
    roomSize?: number // Grid size (default 50 for Screeps)
}

/**
 * Cost callback function type
 * Returns: 0-254 for walkable (cost), 255 for unwalkable
 */
export type CostCallback = (x: number, y: number) => number

/**
 * Finds a path from start to goal using Jump Point Search
 *
 * @param start Starting position
 * @param goal Goal position or array of goal positions (finds path to closest)
 * @param getCost Callback function that returns cost for each position
 * @param options Pathfinding options
 * @returns Array of positions forming the path, or undefined if no path found
 */
export function findPath(
    start: Position,
    goal: Position | Position[],
    getCost: CostCallback,
    options: FindPathOptions = {},
): Position[] | undefined {
    const { range = 0, maxOps = 20000, roomSize = 50 } = options

    // Normalize goal to array
    const goals = Array.isArray(goal) ? goal : [goal]

    // Create grid where 0 = walkable, 1 = blocked
    const grid = new PF.Grid(roomSize, roomSize)

    // Fill grid based on cost callback
    for (let x = 0; x < roomSize; x++) {
        for (let y = 0; y < roomSize; y++) {
            const cost = getCost(x, y)
            // 255 = unwalkable, everything else is walkable
            if (cost >= 255) {
                grid.setWalkableAt(x, y, false)
            }
        }
    }

    // Use A* for reliable pathfinding with obstacles
    const finder = new PF.AStarFinder({
        allowDiagonal: true,
        dontCrossCorners: true,
    })

    let bestPath: number[][] | undefined
    let bestPathCost = Infinity

    // Try pathfinding to each goal and pick the best one
    for (const g of goals) {
        // Calculate all positions within range of this goal
        const targetPositions: Position[] = []
        if (range === 0) {
            targetPositions.push(g)
        } else {
            // Get all positions within range
            for (let dx = -range; dx <= range; dx++) {
                for (let dy = -range; dy <= range; dy++) {
                    const tx = g.x + dx
                    const ty = g.y + dy
                    if (tx >= 0 && tx < roomSize && ty >= 0 && ty < roomSize) {
                        const dist = Math.max(Math.abs(dx), Math.abs(dy))
                        if (dist <= range && getCost(tx, ty) < 255) {
                            targetPositions.push({ x: tx, y: ty })
                        }
                    }
                }
            }
        }

        // Try each target position
        for (const target of targetPositions) {
            // Clone grid for this search (JPS modifies it)
            const gridClone = grid.clone()

            try {
                const path = finder.findPath(start.x, start.y, target.x, target.y, gridClone)

                if (path.length > 0) {
                    // Calculate actual path cost using the cost callback
                    let pathCost = 0
                    for (let i = 1; i < path.length; i++) {
                        const [x, y] = path[i]
                        const cost = getCost(x, y)
                        const [px, py] = path[i - 1]
                        // Diagonal moves cost sqrt(2) times the terrain cost
                        const isDiagonal = Math.abs(x - px) === 1 && Math.abs(y - py) === 1
                        pathCost += cost * (isDiagonal ? Math.SQRT2 : 1)
                    }

                    if (pathCost < bestPathCost) {
                        bestPath = path
                        bestPathCost = pathCost
                    }
                }
            } catch (e) {
                // Path not found to this target, continue
                continue
            }

            // Early exit if we have a reasonable path
            if (bestPath && bestPath.length < maxOps / 10) {
                break
            }
        }
    }

    // Convert path to Position array, excluding the start position
    if (bestPath && bestPath.length > 0) {
        return bestPath.slice(1).map(([x, y]) => ({ x, y }))
    }

    return undefined
}

/**
 * Creates a cost callback function from a RoomTerrain object
 * Uses standard Screeps terrain costs: plain=2, swamp=5, wall=255
 *
 * @param terrain RoomTerrain object
 * @returns Cost callback function
 */
export function createTerrainCostCallback(terrain: RoomTerrain): CostCallback {
    return (x: number, y: number): number => {
        const terrainType = terrain.get(x, y)
        if (terrainType === TERRAIN_MASK_WALL) {
            return 255
        }
        if (terrainType === TERRAIN_MASK_SWAMP) {
            return 5
        }
        return 2 // plain
    }
}

/**
 * Creates a cost callback that layers obstacle blocking on top of terrain costs
 *
 * @param baseCost Base cost callback (e.g., from createTerrainCostCallback)
 * @param obstacles Set of position keys ("x,y") that should be blocked
 * @returns Combined cost callback
 */
export function withObstacles(baseCost: CostCallback, obstacles: Set<string>): CostCallback {
    return (x: number, y: number): number => {
        if (obstacles.has(`${x},${y}`)) {
            return 255
        }
        return baseCost(x, y)
    }
}

/**
 * Creates a cost callback that prefers certain positions (e.g., existing roads)
 *
 * @param baseCost Base cost callback
 * @param preferredPositions Map of position keys ("x,y") to their preferred costs
 * @returns Combined cost callback
 */
export function withPreferred(
    baseCost: CostCallback,
    preferredPositions: Map<string, number>,
): CostCallback {
    return (x: number, y: number): number => {
        const key = `${x},${y}`
        const preferred = preferredPositions.get(key)
        if (preferred !== undefined) {
            return preferred
        }
        return baseCost(x, y)
    }
}
