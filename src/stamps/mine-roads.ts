import {
    MultiRoomCostCallback,
    createMultiRoomTerrainCost,
    findMultiRoomPath,
    withMultiRoomObstacles,
    withMultiRoomPreferredPaths,
} from '../libs/pathfinding'
import { FlatRoomPosition, Position } from '../types'
import { Mine } from '../managers/mine-manager'
import * as Logger from '../utils/logger'

/**
 * Result of calculating roads from base to a remote mine
 */
export interface MineRoadResult {
    name: string
    exitPosition: FlatRoomPosition
    entrancePosition: FlatRoomPosition
    minerRoads: Position[] // Roads in base room
}

/**
 * Calculates roads from base storage to remote mine sources using multi-room pathfinding.
 * Returns exit/entrance positions and road positions for the base room.
 *
 * This maintains coordination between miner (base) and minee (mine) by calculating
 * the path simultaneously and extracting the exit/entrance points where they connect.
 *
 * @param baseRoomName - Name of the base (miner) room
 * @param storage - Position of storage in base room
 * @param mines - List of mines assigned to this base room
 * @param baseBunkerBuildings - Map of structure types to positions in the base bunker
 * @returns Array of mine road results with exit/entrance positions
 */
export function calculateMineRoads(
    baseRoomName: string,
    storage: Position,
    mines: Mine[],
    baseBunkerBuildings: Map<string, Position[]>,
): MineRoadResult[] {
    const results: MineRoadResult[] = []

    for (const mine of mines) {
        // Get mine scout data
        const roomMemory = Memory.rooms[mine.name]
        if (!roomMemory?.scout?.sourcePositions) {
            Logger.warning(
                'calculateMineRoads:no-scout-data',
                mine.name,
                'Skipping mine - no scout data',
            )
            continue
        }

        // Create goal positions (mine sources) - path to within range 1
        const goals: FlatRoomPosition[] = Object.values(
            roomMemory.scout.sourcePositions,
        ).map((pos) => ({
            roomName: mine.name,
            x: pos.x,
            y: pos.y,
        }))

        // Build obstacles and roads from bunker buildings
        const obstacles = new Set<string>()
        const roadPositions = new Set<string>()

        // First pass: collect all roads
        const roads = baseBunkerBuildings.get('road') || []
        for (const pos of roads) {
            roadPositions.add(`${baseRoomName}:${pos.x},${pos.y}`)
        }

        // Second pass: block base bunker structures (except roads and ramparts which don't block movement)
        // Note: Even if a position has a road, we still mark it as an obstacle if it has another structure
        // This ensures mine roads avoid structures like extensions, even if they're on road tiles
        for (const [structType, positions] of baseBunkerBuildings.entries()) {
            if (structType !== 'road' && structType !== 'rampart') {
                for (const pos of positions) {
                    obstacles.add(`${baseRoomName}:${pos.x},${pos.y}`)
                }
            }
        }

        // Remove the start position from obstacles (storage shouldn't block itself)
        obstacles.delete(`${baseRoomName}:${storage.x},${storage.y}`)

        // Build cost callback: base terrain + preferred roads (cost 1) + obstacles (cost 255)
        // Obstacles are impassable - pathfinding should use existing roads to navigate around the bunker
        let getCost: MultiRoomCostCallback = createMultiRoomTerrainCost()
        getCost = withMultiRoomPreferredPaths(getCost, roadPositions, 1)
        getCost = withMultiRoomObstacles(getCost, obstacles, 255)

        // Mark sources as unwalkable (cost 255) since they're not passable
        const sourceObstacles = new Set<string>()
        for (const goal of goals) {
            sourceObstacles.add(`${goal.roomName}:${goal.x},${goal.y}`)
        }
        getCost = withMultiRoomObstacles(getCost, sourceObstacles, 255)

        // Find path from storage to mine sources
        const path = findMultiRoomPath(
            { roomName: baseRoomName, x: storage.x, y: storage.y },
            goals,
            getCost,
            { range: 1 }, // Path to adjacent to source
        )

        if (!path || path.length === 0) {
            Logger.error('calculateMineRoads:no-path', mine.name, 'No path found to mine')
            continue
        }

        // Split path by room
        const minerPath = path.filter((p) => p.roomName === baseRoomName)
        const mineePath = path.filter((p) => p.roomName === mine.name)

        if (minerPath.length === 0 || mineePath.length === 0) {
            Logger.error(
                'calculateMineRoads:empty-path-segment',
                mine.name,
                'Path missing in base or mine room',
            )
            continue
        }

        // Exit is last position in base room, entrance is first in mine room
        const exitPosition = minerPath[minerPath.length - 1]
        const entrancePosition = mineePath[0]

        // Extract base room roads (exclude exit position - can't build on room edge)
        const minerRoads = minerPath.slice(0, -1).map((p) => ({ x: p.x, y: p.y }))

        results.push({
            name: mine.name,
            exitPosition,
            entrancePosition,
            minerRoads,
        })
    }

    return results
}
