import * as EasyStar from 'easystarjs'
import { AStarFinder } from 'astar-typescript-cost'
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

    // Create cost matrix for astar-typescript-cost
    const matrix: number[][] = []
    for (let y = 0; y < roomSize; y++) {
        const row: number[] = []
        for (let x = 0; x < roomSize; x++) {
            const cost = getCost(x, y)
            // Use cost directly, maxCost (255) means impassable
            row.push(cost)
        }
        matrix.push(row)
    }

    // Create AStarFinder instance
    const finder = new AStarFinder({
        grid: {
            matrix,
            maxCost: 255,
        },
        diagonalAllowed: true,
        includeStartNode: false,
        includeEndNode: true,
        heuristic: 'Manhattan',
        weight: 1.0,
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
            try {
                const path = finder.findPath(
                    { x: start.x, y: start.y },
                    { x: target.x, y: target.y },
                )

                if (path.length > 0) {
                    // path is already in number[][] format: [[x1, y1], [x2, y2], ...]
                    const pathArray: number[][] = path

                    // Calculate actual path cost using the cost callback
                    let pathCost = 0
                    for (let i = 1; i < pathArray.length; i++) {
                        const [x, y] = pathArray[i]
                        const cost = getCost(x, y)
                        const [px, py] = pathArray[i - 1]
                        // Diagonal moves cost sqrt(2) times the terrain cost
                        const isDiagonal = Math.abs(x - px) === 1 && Math.abs(y - py) === 1
                        pathCost += cost * (isDiagonal ? Math.SQRT2 : 1)
                    }

                    if (pathCost < bestPathCost) {
                        bestPath = pathArray
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
 * Direction between two adjacent rooms
 */
enum RoomDirection {
    East,
    West,
    North,
    South,
}

/**
 * Coordinate translation functions for converting between world and grid coordinates
 */
interface CoordinateTranslator {
    /** Grid dimensions */
    gridWidth: number
    gridHeight: number
    /** Translate start position from world to grid coordinates */
    translateStart: (pos: FlatRoomPosition) => Position
    /** Translate goal position from world to grid coordinates */
    translateGoal: (pos: FlatRoomPosition) => Position
    /** Translate grid position back to world coordinates */
    translateBack: (gridPos: Position) => FlatRoomPosition
}

/**
 * Determines the direction from start room to goal room
 */
function getAdjacentRoomDirection(
    startRoom: string,
    goalRoom: string,
): { direction: RoomDirection; dx: number; dy: number } {
    const startCoords = parseRoomName(startRoom)
    const goalCoords = parseRoomName(goalRoom)

    const dx = goalCoords.x - startCoords.x
    const dy = goalCoords.y - startCoords.y

    if (Math.abs(dx) + Math.abs(dy) !== 1) {
        throw new Error(`Rooms ${startRoom} and ${goalRoom} are not adjacent`)
    }

    if (dx > 0) return { direction: RoomDirection.East, dx, dy }
    if (dx < 0) return { direction: RoomDirection.West, dx, dy }
    if (dy > 0) return { direction: RoomDirection.North, dx, dy }
    return { direction: RoomDirection.South, dx, dy }
}

/**
 * Creates coordinate translators for horizontal adjacency (East/West)
 */
function createHorizontalTranslator(
    direction: RoomDirection.East | RoomDirection.West,
    startRoom: string,
    goalRoom: string,
    roomSize: number,
): CoordinateTranslator {
    const gridWidth = roomSize * 2
    const gridHeight = roomSize

    if (direction === RoomDirection.East) {
        return {
            gridWidth,
            gridHeight,
            translateStart: (pos) => ({ x: pos.x, y: pos.y }),
            translateGoal: (pos) => ({ x: pos.x + roomSize, y: pos.y }),
            translateBack: (gpos) => ({
                roomName: gpos.x < roomSize ? startRoom : goalRoom,
                x: gpos.x % roomSize,
                y: gpos.y,
            }),
        }
    } else {
        return {
            gridWidth,
            gridHeight,
            translateStart: (pos) => ({ x: pos.x + roomSize, y: pos.y }),
            translateGoal: (pos) => ({ x: pos.x, y: pos.y }),
            translateBack: (gpos) => ({
                roomName: gpos.x >= roomSize ? startRoom : goalRoom,
                x: gpos.x % roomSize,
                y: gpos.y,
            }),
        }
    }
}

/**
 * Creates coordinate translators for vertical adjacency (North/South)
 */
function createVerticalTranslator(
    direction: RoomDirection.North | RoomDirection.South,
    startRoom: string,
    goalRoom: string,
    roomSize: number,
): CoordinateTranslator {
    const gridWidth = roomSize
    const gridHeight = roomSize * 2

    if (direction === RoomDirection.North) {
        return {
            gridWidth,
            gridHeight,
            translateStart: (pos) => ({ x: pos.x, y: pos.y + roomSize }),
            translateGoal: (pos) => ({ x: pos.x, y: pos.y }),
            translateBack: (gpos) => ({
                roomName: gpos.y < roomSize ? goalRoom : startRoom,
                x: gpos.x,
                y: gpos.y % roomSize,
            }),
        }
    } else {
        // South: start room is NORTH (top of grid), goal room is SOUTH (bottom of grid)
        return {
            gridWidth,
            gridHeight,
            translateStart: (pos) => ({ x: pos.x, y: pos.y }),              // Start stays in top half (0-49)
            translateGoal: (pos) => ({ x: pos.x, y: pos.y + roomSize }),    // Goal goes to bottom half (50-99)
            translateBack: (gpos) => ({
                roomName: gpos.y < roomSize ? startRoom : goalRoom,         // Top half is start, bottom is goal
                x: gpos.x,
                y: gpos.y % roomSize,
            }),
        }
    }
}

/**
 * Creates appropriate coordinate translator based on room direction
 */
function createCoordinateTranslator(
    direction: RoomDirection,
    startRoom: string,
    goalRoom: string,
    roomSize: number,
): CoordinateTranslator {
    if (direction === RoomDirection.East || direction === RoomDirection.West) {
        return createHorizontalTranslator(direction, startRoom, goalRoom, roomSize)
    } else {
        return createVerticalTranslator(direction, startRoom, goalRoom, roomSize)
    }
}

/**
 * Gets all target positions within range of a goal
 */
function getTargetPositions(
    goalGrid: Position,
    range: number,
    translator: CoordinateTranslator,
    getCost: MultiRoomCostCallback,
): Position[] {
    if (range === 0) {
        return [goalGrid]
    }

    const { gridWidth, gridHeight, translateBack } = translator
    const targetPositions: Position[] = []
    const blockedCount = { total: 0, outOfBounds: 0, highCost: 0 }

    for (let ddx = -range; ddx <= range; ddx++) {
        for (let ddy = -range; ddy <= range; ddy++) {
            const tx = goalGrid.x + ddx
            const ty = goalGrid.y + ddy

            if (tx >= 0 && tx < gridWidth && ty >= 0 && ty < gridHeight) {
                const dist = Math.max(Math.abs(ddx), Math.abs(ddy))
                const worldPos = translateBack({ x: tx, y: ty })
                const cost = getCost(worldPos.roomName, worldPos.x, worldPos.y)

                if (dist <= range && cost < 255) {
                    targetPositions.push({ x: tx, y: ty })
                } else if (dist <= range) {
                    blockedCount.highCost++
                }
            } else {
                blockedCount.outOfBounds++
            }
            blockedCount.total++
        }
    }

    if (targetPositions.length < 3) {
        console.log(
            `[getTargetPositions] Goal(${goalGrid.x},${goalGrid.y}): ${targetPositions.length} walkable, ${blockedCount.highCost} blocked, ${blockedCount.outOfBounds} out of bounds`,
        )
        // Log each neighbor's cost
        for (let ddx = -range; ddx <= range; ddx++) {
            for (let ddy = -range; ddy <= range; ddy++) {
                if (ddx === 0 && ddy === 0) continue
                const tx = goalGrid.x + ddx
                const ty = goalGrid.y + ddy
                if (tx >= 0 && tx < gridWidth && ty >= 0 && ty < gridHeight) {
                    const worldPos = translateBack({ x: tx, y: ty })
                    const cost = getCost(worldPos.roomName, worldPos.x, worldPos.y)
                    console.log(
                        `  Neighbor grid(${tx},${ty}) = ${worldPos.roomName}(${worldPos.x},${worldPos.y}) cost=${cost}`,
                    )
                }
            }
        }
    }

    return targetPositions
}

/**
 * Calculates the total cost of a path
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function calculatePathCost(
    path: number[][],
    translator: CoordinateTranslator,
    getCost: MultiRoomCostCallback,
): number {
    const { translateBack } = translator
    let pathCost = 0

    for (let i = 1; i < path.length; i++) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
        const pathStep: [number, number] = path[i] as [number, number]
        const [gx, gy] = pathStep
        const worldPos = translateBack({ x: gx, y: gy })
        const cost = getCost(worldPos.roomName, worldPos.x, worldPos.y)

        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
        const prevStep: [number, number] = path[i - 1] as [number, number]
        const [pgx, pgy] = prevStep
        const isDiagonal = Math.abs(gx - pgx) === 1 && Math.abs(gy - pgy) === 1

        pathCost += cost * (isDiagonal ? Math.SQRT2 : 1)
    }

    return pathCost
}

/**
 * Finds the best path to any of the given target positions using astar-typescript-cost
 * This version supports proper cost-based pathfinding and handles diagonal-only scenarios better
 *
 * NOTE: Currently unused due to compatibility issues with basic pathfinding scenarios.
 * The astar-typescript-cost library fails to find paths in some cases where PathFinding.js succeeds.
 * Keeping this implementation for future investigation and potential alternative pathfinder.
 *
 * @experimental
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function findBestPathWithAstar(
    startGrid: Position,
    targetPositions: Position[],
    translator: CoordinateTranslator,
    getCost: MultiRoomCostCallback,
    maxOps: number,
): { path: number[][]; cost: number } | null {
    const { gridWidth, gridHeight, translateBack } = translator

    // Build cost matrix for astar-typescript-cost
    // Library uses positive numbers for terrain cost, with maxCost as the impassable threshold
    // Tiles with cost >= maxCost are treated as walls
    const matrix: number[][] = []
    const maxCost = 255 // Tiles with cost >= 255 are impassable

    // Count walkable neighbors around start for debugging
    let walkableNeighbors = 0
    const startY = startGrid.y
    const startX = startGrid.x

    for (let gy = 0; gy < gridHeight; gy++) {
        const row: number[] = []
        for (let gx = 0; gx < gridWidth; gx++) {
            const worldPos = translateBack({ x: gx, y: gy })
            const cost = getCost(worldPos.roomName, worldPos.x, worldPos.y)
            // Pass through cost as-is, clamping only at maxCost for impassable tiles
            // This preserves the cost model: plains=2, swamp=5, roads=1, walls=255
            const mappedCost = Math.min(cost, maxCost)
            row.push(mappedCost)

            // Count walkable neighbors around start
            const dx = Math.abs(gx - startX)
            const dy = Math.abs(gy - startY)
            if (dx <= 1 && dy <= 1 && !(dx === 0 && dy === 0) && mappedCost < 255) {
                walkableNeighbors++
            }
        }
        matrix.push(row)
    }

    if (walkableNeighbors === 0) {
        return null
    }

    // Create AStarFinder instance with cost support
    const aStarInstance = new AStarFinder({
        grid: {
            matrix,
            maxCost, // Tiles with this cost or higher are impassable
        },
        diagonalAllowed: true,
        includeStartNode: false,
        includeEndNode: true,
        heuristic: 'Manhattan',
        weight: 1.0, // Standard A* (not Dijkstra)
    })

    let bestPath: number[][] | null = null
    let bestPathCost = Infinity

    for (const target of targetPositions) {
        const path = aStarInstance.findPath(
            { x: startGrid.x, y: startGrid.y },
            { x: target.x, y: target.y },
        )

        if (path.length > 0) {
            // Path is already in number[][] format [x, y]
            const pathArray: number[][] = path

            // Calculate actual path cost using our cost function
            let pathCost = 0
            let prevPos = [startGrid.x, startGrid.y]

            for (const posArray of pathArray) {
                const worldPos = translateBack({ x: posArray[0], y: posArray[1] })
                const cost = getCost(worldPos.roomName, worldPos.x, worldPos.y)

                // Check if diagonal
                const isDiagonal =
                    Math.abs(posArray[0] - prevPos[0]) === 1 &&
                    Math.abs(posArray[1] - prevPos[1]) === 1
                pathCost += cost * (isDiagonal ? Math.SQRT2 : 1)

                prevPos = posArray
            }

            if (pathCost < bestPathCost) {
                bestPath = pathArray
                bestPathCost = pathCost
            }
        }

        // Early exit if we have a reasonable path
        if (bestPath && bestPath.length < maxOps / 10) {
            break
        }
    }

    return bestPath ? { path: bestPath, cost: bestPathCost } : null
}

/**
 * Finds a path across two adjacent rooms using A* pathfinding
 *
 * This function creates a combined grid representing both rooms and uses A* to find
 * the optimal path. It only works for adjacent rooms (one step apart).
 *
 * @param start Starting position with room name
 * @param goal Goal position (or array of positions) with room name
 * @param getCost Callback that returns cost for a position in any room
 * @param options Pathfinding options (range, maxOps, roomSize)
 * @returns Array of positions with room names, or undefined if no path found
 *
 * @example
 * ```typescript
 * // Path from E5S7 to E6S7 (adjacent rooms going east)
 * const path = findMultiRoomPath(
 *   { roomName: 'E5S7', x: 45, y: 25 },
 *   { roomName: 'E6S7', x: 5, y: 25 },
 *   createMultiRoomTerrainCost()
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

    const goals = Array.isArray(goal) ? goal : [goal]
    const startRoom = start.roomName
    const goalRoom = goals[0].roomName

    if (startRoom === goalRoom) {
        throw new Error('Use findPath for same-room pathfinding')
    }

    // Determine room direction and create coordinate translator
    const { direction } = getAdjacentRoomDirection(startRoom, goalRoom)
    const translator = createCoordinateTranslator(direction, startRoom, goalRoom, roomSize)

    // Convert start and goals to grid coordinates
    const startGrid = translator.translateStart(start)
    const goalsGrid = goals.map((g) => translator.translateGoal(g))

    // Find best path across all goals
    let bestResult: { path: number[][]; cost: number } | null = null

    for (const goalGrid of goalsGrid) {
        const targetPositions = getTargetPositions(goalGrid, range, translator, getCost)

        console.log(
            `[findMultiRoomPath] Goal: ${goalGrid.x},${goalGrid.y} -> ${targetPositions.length} targets`,
        )

        const result = findBestPathWithAstar(
            startGrid,
            targetPositions,
            translator,
            getCost,
            maxOps,
        )

        if (result && (!bestResult || result.cost < bestResult.cost)) {
            bestResult = result
        }
    }

    // Convert best path back to world coordinates
    if (bestResult) {
        console.log(
            `[findMultiRoomPath] Found path with cost ${bestResult.cost}, length ${bestResult.path.length}`,
        )
        return bestResult.path
            .slice(1)
            .map(([gx, gy]) => translator.translateBack({ x: gx, y: gy }))
    }

    return undefined
}

/**
 * Finds a weighted path across two adjacent rooms using EasyStar
 * This version properly respects tile costs for pathfinding decisions
 *
 * @param start Starting position with room name
 * @param goal Goal position (or array of positions) with room name
 * @param getCost Callback that returns cost for a position in any room
 * @param options Pathfinding options (range, maxOps, roomSize)
 * @returns Promise of array of positions with room names, or undefined if no path found
 */
export function findWeightedMultiRoomPath(
    start: FlatRoomPosition,
    goal: FlatRoomPosition | FlatRoomPosition[],
    getCost: MultiRoomCostCallback,
    options: FindPathOptions = {},
): Promise<FlatRoomPosition[] | undefined> {
    const { range = 0, roomSize = 50 } = options

    const goals = Array.isArray(goal) ? goal : [goal]
    const startRoom = start.roomName
    const goalRoom = goals[0].roomName

    if (startRoom === goalRoom) {
        throw new Error('Use findPath for same-room pathfinding')
    }

    // Determine room direction and create coordinate translator
    const { direction } = getAdjacentRoomDirection(startRoom, goalRoom)
    const translator = createCoordinateTranslator(direction, startRoom, goalRoom, roomSize)

    // Build cost grid for EasyStar
    const costGrid: number[][] = []
    for (let gy = 0; gy < translator.gridHeight; gy++) {
        const row: number[] = []
        for (let gx = 0; gx < translator.gridWidth; gx++) {
            const worldPos = translator.translateBack({ x: gx, y: gy })
            const cost = getCost(worldPos.roomName, worldPos.x, worldPos.y)
            // EasyStar uses 0 for blocked, positive numbers for cost
            row.push(cost >= 255 ? 0 : cost)
        }
        costGrid.push(row)
    }

    // Create EasyStar instance
    const easystar = new EasyStar.js()
    easystar.setGrid(costGrid)
    easystar.enableDiagonals()
    easystar.disableCornerCutting()

    // Set acceptable tiles (anything that's not 0/blocked)
    const acceptableTiles: number[] = []
    for (let cost = 1; cost < 255; cost++) {
        acceptableTiles.push(cost)
    }
    easystar.setAcceptableTiles(acceptableTiles)

    // Set tile costs for EasyStar (it needs explicit cost mapping)
    for (let cost = 1; cost < 255; cost++) {
        easystar.setTileCost(cost, cost)
    }

    // Convert start and goals to grid coordinates
    const startGrid = translator.translateStart(start)
    const goalsGrid = goals.map((g) => translator.translateGoal(g))

    // Find best path across all goals
    return new Promise<FlatRoomPosition[] | undefined>((resolve) => {
        let pathsCompleted = 0
        let bestPath: { x: number; y: number }[] | undefined
        let bestCost = Infinity

        for (const goalGrid of goalsGrid) {
            // Get target positions within range
            const targetPositions = getTargetPositions(goalGrid, range, translator, getCost)

            console.log(
                `[findWeightedMultiRoomPath] Goal: ${goalGrid.x},${goalGrid.y} -> ${targetPositions.length} targets`,
            )

            if (targetPositions.length === 0) {
                pathsCompleted++
                if (pathsCompleted === goalsGrid.length) {
                    if (bestPath) {
                        console.log(
                            `[findWeightedMultiRoomPath] Found path with cost ${bestCost}, length ${bestPath.length}`,
                        )
                        resolve(
                            bestPath
                                .slice(1)
                                .map((pos) => translator.translateBack({ x: pos.x, y: pos.y })),
                        )
                    } else {
                        console.log(`[findWeightedMultiRoomPath] NO PATH FOUND`)
                        console.log(
                            `  Start: ${start.roomName}(${start.x},${start.y}) -> grid(${startGrid.x},${startGrid.y})`,
                        )
                        console.log(
                            `  Goals: ${goals
                                .map((g) => `${g.roomName}(${g.x},${g.y})`)
                                .join(', ')}`,
                        )
                        console.log(`  Grid size: ${translator.gridWidth}x${translator.gridHeight}`)
                        resolve(undefined)
                    }
                }
                continue
            }

            // Try each target position
            for (const target of targetPositions) {
                easystar.findPath(
                    startGrid.x,
                    startGrid.y,
                    target.x,
                    target.y,
                    (path: { x: number; y: number }[] | null) => {
                        if (path && path.length > 0) {
                            // Calculate actual cost
                            let pathCost = 0
                            for (let i = 1; i < path.length; i++) {
                                const worldPos = translator.translateBack({
                                    x: path[i].x,
                                    y: path[i].y,
                                })
                                const cost = getCost(worldPos.roomName, worldPos.x, worldPos.y)
                                const prevPos = path[i - 1]
                                const isDiagonal =
                                    Math.abs(path[i].x - prevPos.x) === 1 &&
                                    Math.abs(path[i].y - prevPos.y) === 1
                                pathCost += cost * (isDiagonal ? Math.SQRT2 : 1)
                            }

                            if (pathCost < bestCost) {
                                bestPath = path
                                bestCost = pathCost
                            }
                        }

                        pathsCompleted++
                        if (pathsCompleted === goalsGrid.length * targetPositions.length) {
                            if (bestPath) {
                                console.log(
                                    `[findWeightedMultiRoomPath] Found path with cost ${bestCost}, length ${bestPath.length}`,
                                )
                                resolve(
                                    bestPath
                                        .slice(1)
                                        .map((pos) =>
                                            translator.translateBack({ x: pos.x, y: pos.y }),
                                        ),
                                )
                            } else {
                                console.log(`[findWeightedMultiRoomPath] NO PATH FOUND`)
                                console.log(
                                    `  Start: ${start.roomName}(${start.x},${start.y}) -> grid(${startGrid.x},${startGrid.y})`,
                                )
                                console.log(
                                    `  Goals: ${goals
                                        .map((g) => `${g.roomName}(${g.x},${g.y})`)
                                        .join(', ')}`,
                                )
                                console.log(
                                    `  Grid size: ${translator.gridWidth}x${translator.gridHeight}`,
                                )
                                resolve(undefined)
                            }
                        }
                    },
                )
            }
        }

        easystar.calculate()
    })
}

/**
 * Finds a weighted path across two adjacent rooms using EasyStar (synchronous version)
 * This version properly respects tile costs for pathfinding decisions
 *
 * @param start Starting position with room name
 * @param goal Goal position (or array of positions) with room name
 * @param getCost Callback that returns cost for a position in any room
 * @param options Pathfinding options (range, maxOps, roomSize)
 * @returns Array of positions with room names, or undefined if no path found
 */
export function findWeightedMultiRoomPathSync(
    start: FlatRoomPosition,
    goal: FlatRoomPosition | FlatRoomPosition[],
    getCost: MultiRoomCostCallback,
    options: FindPathOptions = {},
): FlatRoomPosition[] | undefined {
    const { range = 0, roomSize = 50 } = options

    const goals = Array.isArray(goal) ? goal : [goal]
    const startRoom = start.roomName
    const goalRoom = goals[0].roomName

    if (startRoom === goalRoom) {
        throw new Error('Use findPath for same-room pathfinding')
    }

    // Determine room direction and create coordinate translator
    const { direction } = getAdjacentRoomDirection(startRoom, goalRoom)
    const translator = createCoordinateTranslator(direction, startRoom, goalRoom, roomSize)

    // Build cost grid for EasyStar
    const costGrid: number[][] = []
    let minCost = Infinity
    let maxCost = 0
    let blockedCount = 0
    for (let gy = 0; gy < translator.gridHeight; gy++) {
        const row: number[] = []
        for (let gx = 0; gx < translator.gridWidth; gx++) {
            const worldPos = translator.translateBack({ x: gx, y: gy })
            const cost = getCost(worldPos.roomName, worldPos.x, worldPos.y)
            // EasyStar uses 0 for blocked, positive numbers for cost
            const easyCost = cost >= 255 ? 0 : cost
            row.push(easyCost)
            if (easyCost === 0) {
                blockedCount++
            } else {
                minCost = Math.min(minCost, easyCost)
                maxCost = Math.max(maxCost, easyCost)
            }
        }
        costGrid.push(row)
    }

    console.log(
        `[findWeightedMultiRoomPathSync] Grid: ${translator.gridWidth}x${translator.gridHeight}, blocked=${blockedCount}, costs=${minCost}-${maxCost}`,
    )

    // Create EasyStar instance
    const easystar = new EasyStar.js()
    easystar.setGrid(costGrid)
    easystar.enableDiagonals()
    easystar.disableCornerCutting()
    // Force synchronous calculation by setting high iterations
    easystar.setIterationsPerCalculation(10000)

    // Set acceptable tiles - EasyStar treats these as the VALUES that are walkable
    // We need to tell it which tile values (costs) are acceptable
    const uniqueCosts = new Set<number>()
    for (const row of costGrid) {
        for (const cost of row) {
            if (cost > 0) {
                uniqueCosts.add(cost)
            }
        }
    }
    const acceptableTiles = Array.from(uniqueCosts)
    easystar.setAcceptableTiles(acceptableTiles)

    // Set tile costs - map each tile value to its actual cost
    for (const cost of uniqueCosts) {
        easystar.setTileCost(cost, cost)
    }

    console.log(
        `[findWeightedMultiRoomPathSync] Acceptable tiles: [${acceptableTiles
            .sort((a, b) => a - b)
            .join(', ')}]`,
    )

    // Convert start and goals to grid coordinates
    const startGrid = translator.translateStart(start)
    const goalsGrid = goals.map((g) => translator.translateGoal(g))

    // Check if start is walkable
    const startCost = costGrid[startGrid.y][startGrid.x]
    console.log(
        `[findWeightedMultiRoomPathSync] Start grid(${startGrid.x},${startGrid.y}) cost=${startCost}`,
    )

    if (startCost === 0) {
        console.log(`[findWeightedMultiRoomPathSync] ERROR: Start position is blocked!`)
        return undefined
    }

    // Find best path across all goals (synchronous collection)
    let bestPath: { x: number; y: number }[] | undefined
    let bestCost = Infinity

    for (const goalGrid of goalsGrid) {
        // Get target positions within range
        const targetPositions = getTargetPositions(goalGrid, range, translator, getCost)

        console.log(
            `[findWeightedMultiRoomPathSync] Goal: ${goalGrid.x},${goalGrid.y} -> ${targetPositions.length} targets`,
        )

        if (targetPositions.length === 0) {
            continue
        }

        // Try the first few target positions to find a path
        for (let i = 0; i < Math.min(3, targetPositions.length); i++) {
            const target = targetPositions[i]
            let foundPath: { x: number; y: number }[] | null = null

            easystar.findPath(
                startGrid.x,
                startGrid.y,
                target.x,
                target.y,
                (path: { x: number; y: number }[] | null) => {
                    foundPath = path
                },
            )

            // Calculate this path
            easystar.calculate()

            if (foundPath) {
                const validPath: { x: number; y: number }[] = foundPath
                // Calculate actual cost
                let pathCost = 0
                for (let j = 1; j < validPath.length; j++) {
                    const worldPos = translator.translateBack({
                        x: validPath[j].x,
                        y: validPath[j].y,
                    })
                    const cost = getCost(worldPos.roomName, worldPos.x, worldPos.y)
                    const prevPos = validPath[j - 1]
                    const isDiagonal =
                        Math.abs(validPath[j].x - prevPos.x) === 1 &&
                        Math.abs(validPath[j].y - prevPos.y) === 1
                    pathCost += cost * (isDiagonal ? Math.SQRT2 : 1)
                }

                if (pathCost < bestCost) {
                    bestPath = validPath
                    bestCost = pathCost
                }
            }
        }
    }

    // Convert best path back to world coordinates
    if (bestPath) {
        console.log(
            `[findWeightedMultiRoomPathSync] Found path with cost ${bestCost}, length ${bestPath.length}`,
        )
        return bestPath.slice(1).map((pos) => translator.translateBack({ x: pos.x, y: pos.y }))
    }

    console.log(`[findWeightedMultiRoomPathSync] NO PATH FOUND`)
    console.log(
        `  Start: ${start.roomName}(${start.x},${start.y}) -> grid(${startGrid.x},${startGrid.y})`,
    )
    console.log(`  Goals: ${goals.map((g) => `${g.roomName}(${g.x},${g.y})`).join(', ')}`)
    console.log(`  Grid size: ${translator.gridWidth}x${translator.gridHeight}`)

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
    obstacleCost = 255,
): MultiRoomCostCallback {
    return (roomName: string, x: number, y: number): number => {
        if (obstacles.has(`${roomName}:${x},${y}`)) {
            return obstacleCost
        }
        return baseCost(roomName, x, y)
    }
}

/**
 * Creates a multi-room cost callback with preferred low-cost paths
 *
 * @param baseCost Base cost callback
 * @param preferredPaths Set of position keys ("roomName:x,y") that should have low cost (e.g., roads)
 * @param preferredCost Cost for preferred positions (default: 1)
 * @returns Combined cost callback
 *
 * @example
 * ```typescript
 * const roads = new Set(['E5S7:25,25', 'E6S7:10,10'])
 * const getCost = withMultiRoomPreferredPaths(
 *   createMultiRoomTerrainCost(),
 *   roads,
 *   1
 * )
 * ```
 */
export function withMultiRoomPreferredPaths(
    baseCost: MultiRoomCostCallback,
    preferredPaths: Set<string>,
    preferredCost = 1,
): MultiRoomCostCallback {
    return (roomName: string, x: number, y: number): number => {
        if (preferredPaths.has(`${roomName}:${x},${y}`)) {
            return preferredCost
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
