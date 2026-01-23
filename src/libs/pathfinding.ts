import * as PF from 'pathfinding'
import { FlatRoomPosition, Position } from '../types'

/**
 * Options for pathfinding
 */
export interface FindPathOptions {
    range?: number // Distance from goal (0 = exact, 1 = adjacent, etc.)
    maxOps?: number // Maximum pathfinding operations
    roomSize?: number // Grid size (default 50 for Screeps)
}

/**
 * Cost callback function type (single-room)
 * Returns: 0-254 for walkable (cost), 255 for unwalkable
 */
export type CostCallback = (x: number, y: number) => number

/**
 * Cost callback function type (multi-room)
 * Returns: 0-254 for walkable (cost), 255 for unwalkable
 */
export type MultiRoomCostCallback = (roomName: string, x: number, y: number) => number

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

// ============================================================================
// MULTI-ROOM PATHFINDING
// ============================================================================

/**
 * Parses a room name into world coordinates
 * E.g., "E5S7" -> {x: 5, y: -7}, "W3N2" -> {x: -3, y: 2}
 */
export function parseRoomName(roomName: string): { x: number; y: number } {
    const match = roomName.match(/^([WE])(\d+)([NS])(\d+)$/)
    if (!match) {
        throw new Error(`Invalid room name: ${roomName}`)
    }

    const [, ew, ewNum, ns, nsNum] = match
    const x = ew === 'W' ? -parseInt(ewNum, 10) - 1 : parseInt(ewNum, 10)
    const y = ns === 'N' ? parseInt(nsNum, 10) : -parseInt(nsNum, 10) - 1

    return { x, y }
}

/**
 * Converts world room coordinates to a room name
 * E.g., {x: 5, y: -7} -> "E5S7", {x: -3, y: 2} -> "W3N2"
 */
export function getRoomNameFromCoords(x: number, y: number): string {
    const ew = x >= 0 ? 'E' : 'W'
    const ns = y >= 0 ? 'N' : 'S'
    const ewNum = x >= 0 ? x : -x - 1
    const nsNum = y >= 0 ? y : -y - 1
    return `${ew}${ewNum}${ns}${nsNum}`
}

/**
 * Calculates bounding box of rooms needed for pathfinding
 */
function getRoomBounds(rooms: string[]): {
    minX: number
    maxX: number
    minY: number
    maxY: number
} {
    let minX = Infinity
    let maxX = -Infinity
    let minY = Infinity
    let maxY = -Infinity

    for (const roomName of rooms) {
        const { x, y } = parseRoomName(roomName)
        minX = Math.min(minX, x)
        maxX = Math.max(maxX, x)
        minY = Math.min(minY, y)
        maxY = Math.max(maxY, y)
    }

    return { minX, maxX, minY, maxY }
}

/**
 * Converts a world position (roomName + x,y) to grid coordinates
 */
function worldToGrid(
    pos: FlatRoomPosition,
    bounds: { minX: number; minY: number },
    roomSize: number,
): Position {
    const roomCoords = parseRoomName(pos.roomName)
    const gridX = (roomCoords.x - bounds.minX) * roomSize + pos.x
    const gridY = (roomCoords.y - bounds.minY) * roomSize + pos.y
    return { x: gridX, y: gridY }
}

/**
 * Converts grid coordinates back to world position
 */
function gridToWorld(
    gridPos: Position,
    bounds: { minX: number; minY: number },
    roomSize: number,
): FlatRoomPosition {
    const roomX = bounds.minX + Math.floor(gridPos.x / roomSize)
    const roomY = bounds.minY + Math.floor(gridPos.y / roomSize)
    const x = gridPos.x % roomSize
    const y = gridPos.y % roomSize
    const roomName = getRoomNameFromCoords(roomX, roomY)
    return { roomName, x, y }
}

/**
 * Finds a path across multiple rooms using Jump Point Search
 *
 * @param start Starting position with room name
 * @param goal Goal position (or array of positions) with room name
 * @param getCost Callback that returns cost for a position in any room
 * @param options Pathfinding options
 * @returns Array of positions with room names, or undefined if no path found
 *
 * @example
 * ```typescript
 * // Path from E5S7 to E6S7
 * const path = findMultiRoomPath(
 *   { roomName: 'E5S7', x: 45, y: 25 },
 *   { roomName: 'E6S7', x: 5, y: 25 },
 *   (roomName, x, y) => {
 *     const terrain = Game.map.getRoomTerrain(roomName)
 *     const terrainType = terrain.get(x, y)
 *     if (terrainType === TERRAIN_MASK_WALL) return 255
 *     if (terrainType === TERRAIN_MASK_SWAMP) return 5
 *     return 2
 *   }
 * )
 * ```
 */
export function findMultiRoomPath(
    start: FlatRoomPosition,
    goal: FlatRoomPosition | FlatRoomPosition[],
    getCost: MultiRoomCostCallback,
    options: FindPathOptions = {},
): FlatRoomPosition[] | undefined {
    const { range = 0, maxOps = 20000, roomSize = 50 } = options

    // Normalize goal to array
    const goals = Array.isArray(goal) ? goal : [goal]

    // Get all unique rooms involved
    const allRooms = new Set<string>([start.roomName, ...goals.map((g) => g.roomName)])

    // Calculate bounding box
    const bounds = getRoomBounds(Array.from(allRooms))
    const gridWidth = (bounds.maxX - bounds.minX + 1) * roomSize
    const gridHeight = (bounds.maxY - bounds.minY + 1) * roomSize

    // Create grid
    const grid = new PF.Grid(gridWidth, gridHeight)

    // Fill grid based on cost callback
    for (let gx = 0; gx < gridWidth; gx++) {
        for (let gy = 0; gy < gridHeight; gy++) {
            const worldPos = gridToWorld({ x: gx, y: gy }, bounds, roomSize)
            const cost = getCost(worldPos.roomName, worldPos.x, worldPos.y)
            if (cost >= 255) {
                grid.setWalkableAt(gx, gy, false)
            }
        }
    }

    // Convert start and goals to grid coordinates
    const startGrid = worldToGrid(start, bounds, roomSize)
    const goalsGrid = goals.map((g) => worldToGrid(g, bounds, roomSize))

    // Use A* for reliable multi-room pathfinding
    const finder = new PF.AStarFinder({
        allowDiagonal: true,
        dontCrossCorners: true,
    })

    let bestPath: number[][] | undefined
    let bestPathCost = Infinity

    // Try pathfinding to each goal
    for (const goalGrid of goalsGrid) {
        // Calculate all positions within range of this goal
        const targetPositions: Position[] = []
        if (range === 0) {
            targetPositions.push(goalGrid)
        } else {
            for (let dx = -range; dx <= range; dx++) {
                for (let dy = -range; dy <= range; dy++) {
                    const tx = goalGrid.x + dx
                    const ty = goalGrid.y + dy
                    if (tx >= 0 && tx < gridWidth && ty >= 0 && ty < gridHeight) {
                        const dist = Math.max(Math.abs(dx), Math.abs(dy))
                        const worldPos = gridToWorld({ x: tx, y: ty }, bounds, roomSize)
                        if (
                            dist <= range &&
                            getCost(worldPos.roomName, worldPos.x, worldPos.y) < 255
                        ) {
                            targetPositions.push({ x: tx, y: ty })
                        }
                    }
                }
            }
        }

        // Try each target position
        for (const target of targetPositions) {
            const gridClone = grid.clone()

            try {
                const path = finder.findPath(
                    startGrid.x,
                    startGrid.y,
                    target.x,
                    target.y,
                    gridClone,
                )

                if (path.length > 0) {
                    // Calculate actual path cost
                    let pathCost = 0
                    for (let i = 1; i < path.length; i++) {
                        const [gx, gy] = path[i]
                        const worldPos = gridToWorld({ x: gx, y: gy }, bounds, roomSize)
                        const cost = getCost(worldPos.roomName, worldPos.x, worldPos.y)
                        const [pgx, pgy] = path[i - 1]
                        const isDiagonal = Math.abs(gx - pgx) === 1 && Math.abs(gy - pgy) === 1
                        pathCost += cost * (isDiagonal ? Math.SQRT2 : 1)
                    }

                    if (pathCost < bestPathCost) {
                        bestPath = path
                        bestPathCost = pathCost
                    }
                }
            } catch (e) {
                continue
            }

            // Early exit if we have a reasonable path
            if (bestPath && bestPath.length < maxOps / 10) {
                break
            }
        }
    }

    // Convert path back to world coordinates, excluding start position
    if (bestPath && bestPath.length > 0) {
        return bestPath.slice(1).map(([gx, gy]) => gridToWorld({ x: gx, y: gy }, bounds, roomSize))
    }

    return undefined
}

/**
 * Creates a multi-room cost callback from terrain data
 * Uses standard Screeps terrain costs: plain=2, swamp=5, wall=255
 *
 * @example
 * ```typescript
 * const getCost = createMultiRoomTerrainCost()
 * const path = findMultiRoomPath(start, goal, getCost)
 * ```
 */
export function createMultiRoomTerrainCost(): MultiRoomCostCallback {
    const terrainCache = new Map<string, RoomTerrain>()

    return (roomName: string, x: number, y: number): number => {
        // Get or create terrain for this room
        if (!terrainCache.has(roomName)) {
            try {
                terrainCache.set(roomName, Game.map.getRoomTerrain(roomName))
            } catch (e) {
                // Room doesn't exist or is unknown - treat as wall
                return 255
            }
        }

        const terrain = terrainCache.get(roomName)
        if (!terrain) {
            // Should never happen, but satisfy linter
            return 255
        }
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
 * Creates a multi-room cost callback that blocks certain positions
 *
 * @param baseCost Base cost callback
 * @param obstacles Set of position keys ("roomName:x,y") that should be blocked
 * @returns Combined cost callback
 *
 * @example
 * ```typescript
 * const obstacles = new Set(['E5S7:25,25', 'E6S7:10,10'])
 * const getCost = withMultiRoomObstacles(
 *   createMultiRoomTerrainCost(),
 *   obstacles
 * )
 * ```
 */
export function withMultiRoomObstacles(
    baseCost: MultiRoomCostCallback,
    obstacles: Set<string>,
): MultiRoomCostCallback {
    return (roomName: string, x: number, y: number): number => {
        if (obstacles.has(`${roomName}:${x},${y}`)) {
            return 255
        }
        return baseCost(roomName, x, y)
    }
}

/**
 * Creates a multi-room cost callback that prefers certain positions (e.g., existing roads)
 *
 * @param baseCost Base cost callback
 * @param preferredPositions Map of position keys ("roomName:x,y") to their preferred costs
 * @returns Combined cost callback
 *
 * @example
 * ```typescript
 * const preferred = new Map([
 *   ['E5S7:25,25', 1], // Road
 *   ['E6S7:10,10', 1]
 * ])
 * const getCost = withMultiRoomPreferred(
 *   createMultiRoomTerrainCost(),
 *   preferred
 * )
 * ```
 */
export function withMultiRoomPreferred(
    baseCost: MultiRoomCostCallback,
    preferredPositions: Map<string, number>,
): MultiRoomCostCallback {
    return (roomName: string, x: number, y: number): number => {
        const key = `${roomName}:${x},${y}`
        const preferred = preferredPositions.get(key)
        if (preferred !== undefined) {
            return preferred
        }
        return baseCost(roomName, x, y)
    }
}
