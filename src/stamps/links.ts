import { LINKS_VERSION } from '../construction-features'
import { Position } from '../types'
import { StationaryPointsResult } from './stationary-points'

/**
 * Result of links calculation
 * Defines the link network configuration for energy transfer
 */
export interface LinksResult {
    version: string
    /** Controller link position */
    controller: Position
    /** Storage link position (for link hauler) */
    storage: Position
    /** Source container links with associated data */
    sourceContainers: {
        source: string // Source ID
        container: Position
        link: Position
    }[]
}

/**
 * Helper to get all positions adjacent to a given position (8 neighbors)
 */
function getNeighbors(x: number, y: number): Position[] {
    const neighbors: Position[] = []
    for (let nx = Math.max(0, x - 1); nx <= Math.min(49, x + 1); nx++) {
        for (let ny = Math.max(0, y - 1); ny <= Math.min(49, y + 1); ny++) {
            if (!(x === nx && y === ny)) {
                neighbors.push({ x: nx, y: ny })
            }
        }
    }
    return neighbors
}

/**
 * Check if two positions are equal
 */
function positionsEqual(a: Position, b: Position): boolean {
    return a.x === b.x && a.y === b.y
}

/**
 * Sort by number of containers adjacent to position (more is better for link placement)
 */
function sortByAdjacentContainers(positions: Position[], containers: Position[]): Position[] {
    const containerSet = new Set(containers.map((c) => `${c.x},${c.y}`))

    const scored = positions.map((pos) => {
        const neighbors = getNeighbors(pos.x, pos.y)
        const adjacentContainerCount = neighbors.filter((n) =>
            containerSet.has(`${n.x},${n.y}`),
        ).length
        return { pos, count: adjacentContainerCount }
    })

    // Sort by count descending
    const sorted = scored.sort((a, b) => b.count - a.count)
    return sorted.map((s) => s.pos)
}

/**
 * Calculate link configuration for a bunker layout
 *
 * Determines and places the link network:
 * - Source links: Adjacent to source containers (prefers positions near multiple containers)
 * - Controller link: Adjacent to controller upgrader position
 * - Storage link: From bunker stamp (already placed)
 *
 * @param terrain Room terrain data
 * @param bunkerBuildings Map of structure type to positions (will be modified to add links)
 * @param stationaryPoints Calculated stationary points (includes container positions)
 * @param sources Array of sources with IDs and positions
 * @param controller Controller position
 * @returns Link configuration for the room
 */
export function calculateLinks(
    terrain: RoomTerrain,
    bunkerBuildings: Map<string, Position[]>,
    stationaryPoints: StationaryPointsResult,
    sources: { id: string; x: number; y: number }[],
    controller: Position,
): LinksResult {
    const storage = bunkerBuildings.get('storage')

    if (!storage || storage.length === 0) {
        throw new Error('Storage not found in bunker buildings')
    }

    const storagePos = storage[0]

    // Get all container positions
    const allContainers = sources.map((s) => stationaryPoints.sources[s.id])
    allContainers.push(stationaryPoints.mineral)

    // Calculate source container links
    const sourceContainerLinks: {
        source: string
        container: Position
        link: Position
    }[] = []

    const placedLinks: Position[] = []

    for (const source of sources) {
        const containerPos = stationaryPoints.sources[source.id]
        if (!containerPos) {
            throw new Error(`Container position not found for source ${source.id}`)
        }

        // Find neighbors of container that are walkable and not blocked
        const containerNeighbors = getNeighbors(containerPos.x, containerPos.y)
        const availablePositions = containerNeighbors.filter((pos) => {
            return (
                terrain.get(pos.x, pos.y) !== TERRAIN_MASK_WALL &&
                !placedLinks.some((l) => positionsEqual(l, pos)) &&
                // Not a container position
                !allContainers.some((c) => positionsEqual(c, pos))
            )
        })

        if (availablePositions.length === 0) {
            throw new Error(
                `No available position for link adjacent to source container at (${containerPos.x}, ${containerPos.y})`,
            )
        }

        // Prefer positions adjacent to multiple containers
        const sortedByContainers = sortByAdjacentContainers(availablePositions, allContainers)
        const linkPos = sortedByContainers[0]

        placedLinks.push(linkPos)
        sourceContainerLinks.push({
            source: source.id,
            container: containerPos,
            link: linkPos,
        })
    }

    // Calculate controller link (adjacent to controller upgrader position OR controller itself)
    const controllerUpgraderPos = stationaryPoints.controllerLink
    const upgraderNeighbors = getNeighbors(controllerUpgraderPos.x, controllerUpgraderPos.y)
    const controllerNeighbors = getNeighbors(controller.x, controller.y)

    // First try positions adjacent to both upgrader and controller
    let availableControllerPositions = upgraderNeighbors.filter((pos) => {
        return (
            terrain.get(pos.x, pos.y) !== TERRAIN_MASK_WALL &&
            !placedLinks.some((l) => positionsEqual(l, pos)) &&
            controllerNeighbors.some((n) => positionsEqual(n, pos))
        )
    })

    // If no position adjacent to both, just find one adjacent to controller
    if (availableControllerPositions.length === 0) {
        availableControllerPositions = controllerNeighbors.filter((pos) => {
            return (
                terrain.get(pos.x, pos.y) !== TERRAIN_MASK_WALL &&
                !placedLinks.some((l) => positionsEqual(l, pos))
            )
        })
    }

    if (availableControllerPositions.length === 0) {
        throw new Error(
            `No available position for controller link near controller at (${controller.x}, ${controller.y})`,
        )
    }

    const controllerLink = availableControllerPositions[0]
    placedLinks.push(controllerLink)

    // Storage link should already be in bunker buildings from the stamp
    // Note: The bunker stamp places the storage link 2 positions north of storage,
    // not immediately adjacent, so we can't use neighbor checking.
    // Instead, we use the link from the bunker stamp directly.
    const bunkerLinks = bunkerBuildings.get('link') || []
    let storageLink = bunkerLinks.length > 0 ? bunkerLinks[0] : null

    // If not in bunker, place it adjacent to storage link hauler position
    if (!storageLink) {
        const storageLinkHaulerPos = stationaryPoints.storageLink
        const storageNeighbors = getNeighbors(storagePos.x, storagePos.y)
        const storageLinkNeighbors = getNeighbors(storageLinkHaulerPos.x, storageLinkHaulerPos.y)
        const availableStoragePositions = storageLinkNeighbors.filter((pos) => {
            return (
                terrain.get(pos.x, pos.y) !== TERRAIN_MASK_WALL &&
                !placedLinks.some((l) => positionsEqual(l, pos)) &&
                // Should be adjacent to storage
                storageNeighbors.some((n) => positionsEqual(n, pos))
            )
        })

        if (availableStoragePositions.length === 0) {
            throw new Error(
                `No available position for storage link adjacent to hauler at (${storageLinkHaulerPos.x}, ${storageLinkHaulerPos.y})`,
            )
        }

        storageLink = availableStoragePositions[0]
        placedLinks.push(storageLink)
    }

    // Add all calculated links to bunker buildings
    const existingLinks = bunkerBuildings.get('link') || []
    const allLinks = [...existingLinks, ...placedLinks]
    bunkerBuildings.set('link', allLinks)

    return {
        version: LINKS_VERSION,
        controller: controllerLink,
        storage: storageLink,
        sourceContainers: sourceContainerLinks,
    }
}
