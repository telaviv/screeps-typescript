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

    // Build rampart position set first (ramparts allow movement through structures)
    const rampartPositions = new Set<string>()
    const ramparts = bunkerBuildings.get('rampart') || []
    for (const pos of ramparts) {
        rampartPositions.add(`${pos.x},${pos.y}`)
    }

    // Build obstacle set from bunker structures (excluding roads, ramparts, storage, and structures under ramparts)
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
        for (const pos of positions) {
            const key = `${pos.x},${pos.y}`
            // Structures under ramparts are walkable (ramparts don't block movement)
            if (!rampartPositions.has(key)) {
                obstacles.add(key)
            }
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

    // Create initial cost callback with obstacles and existing roads
    let costCallback = withPreferred(withObstacles(baseCost, obstacles), preferredCosts)

    // Path to each source from storage (range: 1 for adjacent)
    for (const source of sources) {
        const path = findPath(storage, source, costCallback, { range: 1 })
        addPath(path)
        // Update cost callback to prefer newly added roads
        costCallback = withPreferred(withObstacles(baseCost, obstacles), preferredCosts)
    }

    // Path to controller from storage (range: 1 for adjacent)
    const controllerPath = findPath(storage, controller, costCallback, { range: 1 })
    addPath(controllerPath)
    costCallback = withPreferred(withObstacles(baseCost, obstacles), preferredCosts)

    // Path to mineral from storage (range: 1 for adjacent)
    const mineralPath = findPath(storage, mineral, costCallback, { range: 1 })
    addPath(mineralPath)

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
