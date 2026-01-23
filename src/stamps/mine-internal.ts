import { ConstructionFeatures } from '../construction-features'
import { Position, FlatRoomPosition } from '../types'
import {
    findPath,
    createTerrainCostCallback,
    withObstacles,
    CostCallback,
} from '../libs/pathfinding'
import * as Logger from '../utils/logger'

/**
 * Result of calculating mine internal features
 */
export interface MineInternalResult {
    features: ConstructionFeatures
    points: { [id: Id<Source>]: Position }
}

/**
 * Calculates roads and container positions for a remote mining room.
 * Paths from the entrance position to each source and the controller.
 *
 * @param mineName - Name of the mining room
 * @param entrancePosition - Position where the road enters from the base room
 * @returns Features and stationary points for the mine, or null if calculation fails
 */
export function calculateMineInternal(
    mineName: string,
    entrancePosition: FlatRoomPosition,
): MineInternalResult | null {
    const scout = Memory.rooms[mineName]?.scout
    if (!scout?.sourcePositions) {
        Logger.error('calculateMineInternal:no-scout-data', mineName)
        return null
    }

    const terrain = Game.map.getRoomTerrain(mineName)
    const baseCost: CostCallback = createTerrainCostCallback(terrain)
    const obstacles = new Set<string>()

    // Build features map
    const roads: Position[] = []
    const containers: Position[] = []
    const points: { [id: Id<Source>]: Position } = {}

    // Path to each source
    const sourceEntries = Object.entries(scout.sourcePositions) as [
        Id<Source>,
        { x: number; y: number },
    ][]
    for (const [sourceId, sourcePos] of sourceEntries) {
        const sourcePath = findPath(
            { x: entrancePosition.x, y: entrancePosition.y },
            { x: sourcePos.x, y: sourcePos.y },
            baseCost,
            { range: 1 },
        )

        if (!sourcePath || sourcePath.length === 0) {
            Logger.error('calculateMineInternal:no-source-path', mineName, sourceId)
            return null
        }

        // Add roads (excluding the container position)
        for (let i = 0; i < sourcePath.length - 1; i++) {
            roads.push(sourcePath[i])
        }

        // Container is the last position in the path (adjacent to source)
        const containerPos = sourcePath[sourcePath.length - 1]
        containers.push(containerPos)
        points[sourceId] = containerPos

        // Block this container for future paths
        obstacles.add(`${containerPos.x},${containerPos.y}`)
    }

    // Path to controller if it exists
    if (scout.controllerPosition) {
        const getCost: CostCallback = withObstacles(baseCost, obstacles)
        const controllerPath = findPath(
            { x: entrancePosition.x, y: entrancePosition.y },
            { x: scout.controllerPosition.x, y: scout.controllerPosition.y },
            getCost,
            { range: 3 },
        )

        if (controllerPath && controllerPath.length > 0) {
            // Add controller roads (no container needed for mines)
            for (const pos of controllerPath) {
                roads.push(pos)
            }
        } else {
            Logger.warning('calculateMineInternal:no-controller-path', mineName)
        }
    }

    // Deduplicate roads
    const uniqueRoads: Position[] = []
    const seenRoads = new Set<string>()
    for (const road of roads) {
        const key = `${road.x},${road.y}`
        if (!seenRoads.has(key)) {
            seenRoads.add(key)
            uniqueRoads.push(road)
        }
    }

    return {
        features: {
            [STRUCTURE_ROAD]: uniqueRoads,
            [STRUCTURE_CONTAINER]: containers,
        },
        points,
    }
}
