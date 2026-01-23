import { sortBy } from 'lodash'

import { Position } from '../types'

/**
 * Result of stationary points calculation
 * Defines where static creeps should stand (harvesters, link hauler, upgrader)
 */
export interface StationaryPointsResult {
    /** Where harvesters stand at each source (typically at container position) */
    sources: { [sourceId: string]: Position }
    /** Where mineral harvester stands (at container position next to mineral) */
    mineral: Position
    /** Where controller upgrader stands (next to controller link) */
    controllerLink: Position
    /** Where storage link hauler stands (from bunker stamp) */
    storageLink: Position
}

/**
 * Helper to get all positions adjacent to a given position (8 neighbors)
 */
function getNeighbors(x: number, y: number, radius = 1): Position[] {
    const neighbors: Position[] = []
    for (let nx = Math.max(0, x - radius); nx <= Math.min(49, x + radius); nx++) {
        for (let ny = Math.max(0, y - radius); ny <= Math.min(49, y + radius); ny++) {
            if (!(x === nx && y === ny)) {
                neighbors.push({ x: nx, y: ny })
            }
        }
    }
    return neighbors
}

/**
 * Check if a position is walkable (not a wall)
 */
function isWalkable(terrain: RoomTerrain, x: number, y: number): boolean {
    return terrain.get(x, y) !== TERRAIN_MASK_WALL
}

/**
 * Check if a position has a structure that blocks placement
 */
function hasBlockingStructure(
    bunkerBuildings: Map<string, Position[]>,
    x: number,
    y: number,
): boolean {
    const key = `${x},${y}`
    for (const [structureType, positions] of bunkerBuildings.entries()) {
        if (
            structureType === 'road' ||
            structureType === 'rampart' ||
            structureType === 'container'
        ) {
            continue // These don't block
        }
        if (positions.some((pos) => `${pos.x},${pos.y}` === key)) {
            return true
        }
    }
    return false
}

/**
 * Find the centroid (center point) of sources, controller, and storage
 * Used for tiebreaking when multiple positions are equally good
 */
function findCentroid(
    sources: { id: string; x: number; y: number }[],
    controller: Position,
    storagePos: Position | null,
): Position {
    let xSum = controller.x
    let ySum = controller.y
    let count = 1

    for (const source of sources) {
        xSum += source.x
        ySum += source.y
        count++
    }

    if (storagePos) {
        xSum += storagePos.x
        ySum += storagePos.y
        count++
    }

    return {
        x: Math.floor(xSum / count),
        y: Math.floor(ySum / count),
    }
}

/**
 * Calculate distance between two positions
 */
function distanceBetween(a: Position, b: Position): number {
    return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y))
}

/**
 * Sort positions by distance to centroid (closest first)
 */
function sortByCentroidDistance(positions: Position[], centroid: Position): Position[] {
    return sortBy(positions, (pos) => distanceBetween(pos, centroid))
}

/**
 * Find an available container position for a source
 * Looks for existing container or finds best walkable neighbor
 */
function findSourceContainer(
    terrain: RoomTerrain,
    bunkerBuildings: Map<string, Position[]>,
    source: { id: string; x: number; y: number },
    usedPositions: Set<string>,
    centroid: Position,
): Position | null {
    const neighbors = getNeighbors(source.x, source.y)

    // First check if there's already a container in the bunker buildings
    const containers = bunkerBuildings.get('container') || []
    for (const neighbor of neighbors) {
        const key = `${neighbor.x},${neighbor.y}`
        if (containers.some((c) => `${c.x},${c.y}` === key) && !usedPositions.has(key)) {
            return neighbor
        }
    }

    // Otherwise find best available neighbor (walkable, not blocked, not used)
    const available = neighbors.filter((pos) => {
        const key = `${pos.x},${pos.y}`
        return (
            isWalkable(terrain, pos.x, pos.y) &&
            !hasBlockingStructure(bunkerBuildings, pos.x, pos.y) &&
            !usedPositions.has(key)
        )
    })

    if (available.length === 0) {
        return null
    }

    // Sort by distance to centroid and pick closest
    const sorted = sortByCentroidDistance(available, centroid)
    return sorted[0]
}

/**
 * Calculate stationary points for a bunker layout
 *
 * Determines where static creeps should stand:
 * - Source harvesters: at container positions next to sources
 * - Mineral harvester: at container position next to mineral
 * - Controller upgrader: next to controller link
 * - Storage link hauler: from bunker stamp
 *
 * @param terrain Room terrain data
 * @param bunkerBuildings Map of structure type to positions
 * @param sources Array of sources with IDs and positions
 * @param controller Controller position
 * @param mineral Mineral position
 * @returns Stationary points for creep positioning
 */
export function calculateStationaryPoints(
    terrain: RoomTerrain,
    bunkerBuildings: Map<string, Position[]>,
    sources: { id: string; x: number; y: number }[],
    controller: Position,
    mineral: Position,
): StationaryPointsResult {
    // Get storage position for centroid calculation
    const storagePositions = bunkerBuildings.get('storage')
    const storagePos = storagePositions && storagePositions.length > 0 ? storagePositions[0] : null

    const centroid = findCentroid(sources, controller, storagePos)

    // Calculate source container positions
    const sourcePoints: { [sourceId: string]: Position } = {}
    const usedPositions = new Set<string>()

    // Sort sources by number of available neighbors (sources with fewer neighbors get priority)
    const sourcesWithAvailability = sources.map((source) => {
        const neighbors = getNeighbors(source.x, source.y)
        const availableCount = neighbors.filter(
            (pos) =>
                isWalkable(terrain, pos.x, pos.y) &&
                !hasBlockingStructure(bunkerBuildings, pos.x, pos.y),
        ).length
        return { source, availableCount }
    })
    const sortedSources = sortBy(sourcesWithAvailability, (s) => s.availableCount).map(
        (s) => s.source,
    )

    for (const source of sortedSources) {
        const container = findSourceContainer(
            terrain,
            bunkerBuildings,
            source,
            usedPositions,
            centroid,
        )
        if (!container) {
            throw new Error(
                `Could not find container position for source at (${source.x}, ${source.y})`,
            )
        }
        sourcePoints[source.id] = container
        usedPositions.add(`${container.x},${container.y}`)
    }

    // Calculate mineral container position
    const mineralNeighbors = getNeighbors(mineral.x, mineral.y)
    const availableMineralPositions = mineralNeighbors.filter(
        (pos) =>
            isWalkable(terrain, pos.x, pos.y) &&
            !hasBlockingStructure(bunkerBuildings, pos.x, pos.y),
    )
    if (availableMineralPositions.length === 0) {
        throw new Error(
            `Could not find container position for mineral at (${mineral.x}, ${mineral.y})`,
        )
    }
    const mineralPoint = sortByCentroidDistance(availableMineralPositions, centroid)[0]

    // Find controller upgrader position (next to controller)
    // Note: Controller link will be placed by the links module, we just need to find where the upgrader stands
    const controllerNeighbors = getNeighbors(controller.x, controller.y)
    const availableControllerPositions = controllerNeighbors.filter(
        (pos) =>
            isWalkable(terrain, pos.x, pos.y) &&
            !hasBlockingStructure(bunkerBuildings, pos.x, pos.y),
    )

    if (availableControllerPositions.length === 0) {
        throw new Error(
            `Could not find stationary position next to controller at (${controller.x}, ${controller.y})`,
        )
    }

    // Pick the one closest to centroid
    const controllerLinkPoint = sortByCentroidDistance(availableControllerPositions, centroid)[0]

    // Get storage link hauler position from bunker stamp
    // The bunker stamp specifies this position in stationaryPoints
    if (!storagePos) {
        throw new Error('Storage position not found in bunker buildings')
    }

    // Find position next to storage where link hauler should stand
    // Should be adjacent to storage and walkable
    const storageNeighbors = getNeighbors(storagePos.x, storagePos.y)
    const availableStoragePositions = storageNeighbors.filter(
        (pos) =>
            isWalkable(terrain, pos.x, pos.y) &&
            !hasBlockingStructure(bunkerBuildings, pos.x, pos.y),
    )

    if (availableStoragePositions.length === 0) {
        throw new Error(
            `Could not find stationary position next to storage at (${storagePos.x}, ${storagePos.y})`,
        )
    }

    // Pick the one closest to centroid
    const storageLinkPoint = sortByCentroidDistance(availableStoragePositions, centroid)[0]

    return {
        sources: sourcePoints,
        mineral: mineralPoint,
        controllerLink: controllerLinkPoint,
        storageLink: storageLinkPoint,
    }
}
