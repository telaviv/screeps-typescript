import {
    createTerrainCostCallback,
    findPath,
    withObstacles,
    withPreferred,
} from '../libs/pathfinding'
import { Position } from '../types'

/**
 * Calculates road positions for a bunker layout
 *
 * Paths from storage to sources, controller, and mineral
 * Avoids placing roads on bunker structures
 * Prefers existing road positions for subsequent paths
 *
 * @param terrain Room terrain data
 * @param bunkerBuildings Map of structure type to positions
 * @param sources Array of source positions
 * @param controller Controller position
 * @param mineral Mineral position
 * @returns Array of positions where roads should be placed
 */
export function calculateBunkerRoads(
    terrain: RoomTerrain,
    bunkerBuildings: Map<string, Position[]>,
    sources: Position[],
    controller: Position,
    mineral: Position,
): Position[] {
    // Get storage position (origin of all paths)
    const storagePositions = bunkerBuildings.get('storage')
    if (!storagePositions || storagePositions.length === 0) {
        return []
    }
    const storage = storagePositions[0]

    // Create base terrain cost callback
    const baseCost = createTerrainCostCallback(terrain)

    // Build obstacle set from bunker structures (excluding roads, ramparts, and storage)
    const obstacles = new Set<string>()
    for (const [structureType, positions] of bunkerBuildings.entries()) {
        // Roads, ramparts, and storage don't block pathfinding
        // (storage is the origin, so it must be walkable)
        if (
            structureType === 'road' ||
            structureType === 'rampart' ||
            structureType === 'storage'
        ) {
            continue
        }
        for (const pos of positions) {
            obstacles.add(`${pos.x},${pos.y}`)
        }
    }

    // Track road positions and their preferences
    const roadPositions = new Set<string>()
    const preferredCosts = new Map<string, number>()

    // Helper to add a path and update preferences
    const addPath = (path: Position[] | undefined) => {
        if (!path) return

        for (const pos of path) {
            const key = `${pos.x},${pos.y}`
            roadPositions.add(key)
            // Mark existing roads as preferred (cost=1)
            preferredCosts.set(key, 1)
        }
    }

    // Get existing bunker roads and make them preferred (cost=1)
    const existingRoads = bunkerBuildings.get('road') || []
    for (const road of existingRoads) {
        preferredCosts.set(`${road.x},${road.y}`, 1)
    }

    // Find the edges of the bunker to use as starting points for external paths
    // Use storage as fallback if no roads found
    const startPositions = existingRoads.length > 0 ? existingRoads : [storage]

    // Create initial cost callback with obstacles and existing roads
    let costCallback = withPreferred(withObstacles(baseCost, obstacles), preferredCosts)

    // Path to each source (range: 1 for adjacent)
    // Try from each start position and use the shortest path
    for (const source of sources) {
        let bestPath: Position[] | undefined
        let bestCost = Infinity

        for (const start of startPositions) {
            const path = findPath(start, source, costCallback, { range: 1 })
            if (path) {
                // Calculate path cost
                let cost = 0
                for (const pos of path) {
                    cost += costCallback(pos.x, pos.y)
                }
                if (cost < bestCost) {
                    bestCost = cost
                    bestPath = path
                }
            }
        }

        addPath(bestPath)
        // Update cost callback to prefer existing roads
        costCallback = withPreferred(withObstacles(baseCost, obstacles), preferredCosts)
    }

    // Path to controller (range: 1 for adjacent)
    let bestControllerPath: Position[] | undefined
    let bestControllerCost = Infinity
    for (const start of startPositions) {
        const path = findPath(start, controller, costCallback, { range: 1 })
        if (path) {
            let cost = 0
            for (const pos of path) {
                cost += costCallback(pos.x, pos.y)
            }
            if (cost < bestControllerCost) {
                bestControllerCost = cost
                bestControllerPath = path
            }
        }
    }
    addPath(bestControllerPath)
    costCallback = withPreferred(withObstacles(baseCost, obstacles), preferredCosts)

    // Path to mineral (range: 1 for adjacent)
    let bestMineralPath: Position[] | undefined
    let bestMineralCost = Infinity
    for (const start of startPositions) {
        const path = findPath(start, mineral, costCallback, { range: 1 })
        if (path) {
            let cost = 0
            for (const pos of path) {
                cost += costCallback(pos.x, pos.y)
            }
            if (cost < bestMineralCost) {
                bestMineralCost = cost
                bestMineralPath = path
            }
        }
    }
    addPath(bestMineralPath)

    // Convert road positions to array, filtering out any that overlap with structures
    const roads: Position[] = []
    for (const key of roadPositions) {
        if (!obstacles.has(key)) {
            const [x, y] = key.split(',').map(Number)
            roads.push({ x, y })
        }
    }

    return roads
}
