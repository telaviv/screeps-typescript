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
    /** Stationary point per source: tile the miner permanently occupies (adjacent to source) */
    stationary: { [id: Id<Source>]: Position }
    /** Pickup point per source: tile the hauler stands on to withdraw from the container */
    pickup: { [id: Id<Source>]: Position }
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

    // Block edge positions (we can't build roads on edges). Only the entrance is allowed on an edge.
    const getCost: CostCallback = (x: number, y: number): number => {
        const onEdge = x === 0 || x === 49 || y === 0 || y === 49
        const isEntrance = x === entrancePosition.x && y === entrancePosition.y
        if (onEdge && !isEntrance) {
            return 255
        }
        return baseCost(x, y)
    }

    const obstacles = new Set<string>()

    // Build features map
    const roads: Position[] = []
    const containers: Position[] = []
    const stationary: { [id: Id<Source>]: Position } = {}
    const pickup: { [id: Id<Source>]: Position } = {}

    // Path to each source
    const sourceEntries = Object.entries(scout.sourcePositions) as [
        Id<Source>,
        { x: number; y: number },
    ][]
    for (const [sourceId, sourcePos] of sourceEntries) {
        // Block previously computed containers: stationary miners will occupy those tiles
        const getCostWithObstacles: CostCallback = withObstacles(getCost, obstacles)
        const sourcePath = findPath(
            { x: entrancePosition.x, y: entrancePosition.y },
            { x: sourcePos.x, y: sourcePos.y },
            getCostWithObstacles,
            { range: 1 },
        )

        if (!sourcePath || sourcePath.length === 0) {
            Logger.error('calculateMineInternal:no-source-path', mineName, sourceId)
            return null
        }

        // Add roads (excluding the stationary point / container position)
        for (let i = 0; i < sourcePath.length - 1; i++) {
            roads.push(sourcePath[i])
        }

        // Stationary point: last position in path (adjacent to source) — miner parks here
        const stationaryPos = sourcePath[sourcePath.length - 1]
        containers.push(stationaryPos)
        stationary[sourceId] = stationaryPos

        // Pickup point: tile before stationary — hauler stands here to withdraw
        if (sourcePath.length >= 2) {
            pickup[sourceId] = sourcePath[sourcePath.length - 2]
        }

        // Block this stationary point for future paths
        obstacles.add(`${stationaryPos.x},${stationaryPos.y}`)
    }

    // Path to controller if it exists
    if (scout.controllerPosition) {
        const getCostWithObstacles: CostCallback = withObstacles(getCost, obstacles)
        const controllerPath = findPath(
            { x: entrancePosition.x, y: entrancePosition.y },
            { x: scout.controllerPosition.x, y: scout.controllerPosition.y },
            getCostWithObstacles,
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

    // Deduplicate roads (pathfinding already avoids edges except entrance via cost callback)
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
        stationary,
        pickup,
    }
}
