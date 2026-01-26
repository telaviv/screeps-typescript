import { FlatRoomPosition } from '../types'
import {
    createMultiRoomTerrainCost,
    findMultiRoomPath,
    withMultiRoomObstacles,
    withMultiRoomPreferredPaths,
} from '../libs/pathfinding'

export interface SingleMineRoadsResult {
    exitPosition: { x: number; y: number }
    entrancePosition: { x: number; y: number }
    baseRoads: { x: number; y: number }[]
    mineRoads: { x: number; y: number }[]
}

export interface CalculateSingleMineRoadsOptions {
    baseRoomName: string
    startPosition: { x: number; y: number }
    mineRoomName: string
    mineSources: { x: number; y: number }[]
    obstacles?: Set<string> // Position keys "roomName:x,y" to block (buildings)
    roads?: Set<string> // Position keys "roomName:x,y" for existing roads (low cost)
}

/**
 * Calculates optimal road paths from a base room to mine sources in an adjacent room.
 * This is designed for the CLI tool and other offline planning purposes.
 *
 * @param options Configuration for mine road calculation
 * @returns Mine road information including exit/entrance positions and road tiles, or null if no path found
 *
 * @example
 * ```typescript
 * const obstacles = new Set(['E52S29:30,30']) // Extensions, towers, etc.
 * const roads = new Set(['E52S29:31,30', 'E52S29:32,30']) // Existing roads
 *
 * const result = calculateSingleMineRoads({
 *   baseRoomName: 'E52S29',
 *   startPosition: { x: 33, y: 31 },
 *   mineRoomName: 'E53S29',
 *   mineSources: [{ x: 14, y: 10 }],
 *   obstacles,
 *   roads,
 * })
 * ```
 */
export function calculateSingleMineRoads(
    options: CalculateSingleMineRoadsOptions,
): SingleMineRoadsResult | null {
    const { baseRoomName, startPosition, mineRoomName, mineSources, obstacles, roads } = options

    // Build cost callback with terrain, obstacles, and preferred roads
    let getCost = createMultiRoomTerrainCost()

    // Add existing roads as low-cost preferred paths (cost 1)
    if (roads && roads.size > 0) {
        getCost = withMultiRoomPreferredPaths(getCost, roads, 1)
    }

    // Add obstacles (buildings) as completely blocked (cost 255)
    if (obstacles && obstacles.size > 0) {
        getCost = withMultiRoomObstacles(getCost, obstacles)
    }

    // Create goals (mine sources)
    const goals: FlatRoomPosition[] = mineSources.map((s) => ({
        roomName: mineRoomName,
        x: s.x,
        y: s.y,
    }))

    // Find path from start position to mine sources
    let multiRoomPath
    try {
        multiRoomPath = findMultiRoomPath(
            { roomName: baseRoomName, x: startPosition.x, y: startPosition.y },
            goals,
            getCost,
            { range: 1 }, // Adjacent to source
        )
    } catch (error) {
        return null
    }

    if (!multiRoomPath || multiRoomPath.length === 0) {
        return null
    }

    // Split path by room
    const basePath = multiRoomPath.filter((p) => p.roomName === baseRoomName)
    const minePath = multiRoomPath.filter((p) => p.roomName === mineRoomName)

    if (basePath.length === 0 || minePath.length === 0) {
        return null
    }

    // Exit is last position in base room, entrance is first in mine room
    const exitPosition = basePath[basePath.length - 1]
    const entrancePosition = minePath[0]

    // Extract road positions (excluding exit position as it's on room edge)
    const baseRoads = basePath.slice(0, -1).map((p) => ({ x: p.x, y: p.y }))
    const mineRoads = minePath.map((p) => ({ x: p.x, y: p.y }))

    return {
        exitPosition: { x: exitPosition.x, y: exitPosition.y },
        entrancePosition: { x: entrancePosition.x, y: entrancePosition.y },
        baseRoads,
        mineRoads,
    }
}
