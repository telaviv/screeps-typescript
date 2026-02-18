import {
    createTerrainCostCallback,
    findPath,
    withObstacles,
    withPreferred,
} from '../libs/pathfinding'
import { Position } from '../types'

/**
 * Calculates additional road positions from bunker to external features
 *
 * Paths from storage link stationary point to sources, controller, and mineral stationary point
 * Avoids placing roads on bunker structures
 * Prefers existing road positions for subsequent paths
 *
 * @param terrain Room terrain data
 * @param bunkerBuildings Map of structure type to positions (must include existing roads from stamp)
 * @param startPos Storage link stationary point position (where the hauler stands)
 * @param sources Array of source positions
 * @param controller Controller position
 * @param mineralStationaryPoint Mineral stationary point (container position where harvester/hauler stands)
 * @returns Array of NEW road positions to add (does not include existing stamp roads)
 */
export function calculateBunkerRoads(
    terrain: RoomTerrain,
    bunkerBuildings: Map<string, Position[]>,
    startPos: Position,
    sources: Position[],
    controller: Position,
    mineralStationaryPoint: Position,
): Position[] {
    console.log(
        `[calculateBunkerRoads] Starting from storage link position (${startPos.x}, ${startPos.y})`,
    )

    // Create base terrain cost callback first to check accessibility
    const baseCost = createTerrainCostCallback(terrain)

    // Build rampart position set first (ramparts allow movement through structures)
    const rampartPositions = new Set<string>()
    const ramparts = bunkerBuildings.get('rampart') || []
    for (const pos of ramparts) {
        rampartPositions.add(`${pos.x},${pos.y}`)
    }

    // Build obstacle set from bunker structures (excluding roads, ramparts, and storage)
    const obstacles = new Set<string>()
    for (const [structureType, positions] of bunkerBuildings.entries()) {
        // Roads, ramparts, and storage don't block pathfinding
        if (
            structureType === 'road' ||
            structureType === 'rampart' ||
            structureType === 'storage'
        ) {
            continue
        }
        // All other structures are obstacles (even with ramparts on them)
        for (const pos of positions) {
            const key = `${pos.x},${pos.y}`
            obstacles.add(key)
        }
    }

    // Get existing bunker roads from stamp
    const existingRoads = bunkerBuildings.get('road') || []
    const roadSet = new Set<string>()
    for (const road of existingRoads) {
        roadSet.add(`${road.x},${road.y}`)
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

    // Make existing roads preferred (cost=1)
    for (const road of existingRoads) {
        preferredCosts.set(`${road.x},${road.y}`, 1)
    }

    // Create initial cost callback with obstacles and existing roads
    let costCallback = withPreferred(withObstacles(baseCost, obstacles), preferredCosts)

    // Path to each source from accessible start (range: 1 for adjacent)
    for (const source of sources) {
        const path = findPath(startPos, source, costCallback, { range: 1 })
        addPath(path)
        // Update cost callback to prefer newly added roads
        costCallback = withPreferred(withObstacles(baseCost, obstacles), preferredCosts)
    }

    // Path to controller from accessible start (range: 1 for adjacent)
    const controllerPath = findPath(startPos, controller, costCallback, { range: 1 })
    addPath(controllerPath)
    costCallback = withPreferred(withObstacles(baseCost, obstacles), preferredCosts)

    // Path to mineral stationary point (container position); road ends on that tile
    const mineralPath = findPath(startPos, mineralStationaryPoint, costCallback, { range: 0 })
    addPath(mineralPath)

    // Convert road positions to array, filtering out any that overlap with structures
    const roads: Position[] = []

    // Build set of ALL structure positions (for road placement filtering)
    // Unlike obstacles (for pathfinding), this includes structures under ramparts
    const structurePositions = new Set<string>()
    for (const [structureType, positions] of bunkerBuildings.entries()) {
        // Only roads can overlap with roads, everything else blocks road placement
        if (structureType !== 'road' && structureType !== 'rampart') {
            for (const pos of positions) {
                structurePositions.add(`${pos.x},${pos.y}`)
            }
        }
    }

    // Get existing road keys for duplicate filtering
    const existingRoadKeys = new Set(existingRoads.map((r) => `${r.x},${r.y}`))

    for (const key of roadPositions) {
        // Skip roads that already exist in the stamp OR that overlap with ANY structure
        if (!structurePositions.has(key) && !existingRoadKeys.has(key)) {
            const [x, y] = key.split(',').map(Number)
            // Skip roads on room edges (x=0, x=49, y=0, y=49) - these are walls
            if (x === 0 || x === 49 || y === 0 || y === 49) {
                continue
            }
            roads.push({ x, y })
        }
    }

    return roads
}
