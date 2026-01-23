import { Position } from '../types'
import { StationaryPointsResult } from './stationary-points'

/**
 * Categorized rampart positions by priority
 */
export interface RampartCategories {
    /** Perimeter edge ramparts (highest priority for defense) */
    edges: Position[]
    /** Structure protection ramparts (medium priority) */
    structures: Position[]
    /** General coverage ramparts (lowest priority) */
    others: Position[]
}

/**
 * Gets rampart positions that are on the edges of the bunker.
 * Edge ramparts have the most extreme x or y coordinates within the bunker.
 *
 * @param bunkerRamparts - Rampart positions from the bunker stamp
 * @returns Set of position keys for edge ramparts
 */
function getBunkerEdgeRamparts(bunkerRamparts: Position[]): Set<string> {
    const edges = new Set<string>()

    // Group by y-coordinate (rows) and find min/max x values
    const rowMap = new Map<number, { minX: number; maxX: number; positions: Position[] }>()
    for (const pos of bunkerRamparts) {
        if (!rowMap.has(pos.y)) {
            rowMap.set(pos.y, { minX: pos.x, maxX: pos.x, positions: [pos] })
        } else {
            const row = rowMap.get(pos.y)
            if (row) {
                row.minX = Math.min(row.minX, pos.x)
                row.maxX = Math.max(row.maxX, pos.x)
                row.positions.push(pos)
            }
        }
    }

    // Add ramparts with extreme x values in each row
    for (const row of rowMap.values()) {
        for (const pos of row.positions) {
            if (pos.x === row.minX || pos.x === row.maxX) {
                edges.add(`${pos.x},${pos.y}`)
            }
        }
    }

    // Group by x-coordinate (columns) and find min/max y values
    const colMap = new Map<number, { minY: number; maxY: number; positions: Position[] }>()
    for (const pos of bunkerRamparts) {
        if (!colMap.has(pos.x)) {
            colMap.set(pos.x, { minY: pos.y, maxY: pos.y, positions: [pos] })
        } else {
            const col = colMap.get(pos.x)
            if (col) {
                col.minY = Math.min(col.minY, pos.y)
                col.maxY = Math.max(col.maxY, pos.y)
                col.positions.push(pos)
            }
        }
    }

    // Add ramparts with extreme y values in each column
    for (const col of colMap.values()) {
        for (const pos of col.positions) {
            if (pos.y === col.minY || pos.y === col.maxY) {
                edges.add(`${pos.x},${pos.y}`)
            }
        }
    }

    return edges
}

/**
 * Gets rampart positions that protect important structures.
 *
 * @param bunkerBuildings - Map of structure type to positions
 * @param sources - Source positions
 * @param controller - Controller position
 * @param mineral - Mineral position
 * @param allRamparts - Set of all rampart position keys
 * @returns Set of position keys for structure protection ramparts
 */
function getStructureProtectionRamparts(
    bunkerBuildings: Map<string, Position[]>,
    sources: Position[],
    controller: Position,
    mineral: Position,
    allRamparts: Set<string>,
): Set<string> {
    const structureProtection = new Set<string>()
    const structurePositions: Position[] = []

    // Collect all important structure positions from bunker
    const structureTypes: BuildableStructureConstant[] = [
        STRUCTURE_LINK,
        STRUCTURE_STORAGE,
        STRUCTURE_SPAWN,
        STRUCTURE_TOWER,
        STRUCTURE_TERMINAL,
        STRUCTURE_FACTORY,
        STRUCTURE_LAB,
        STRUCTURE_NUKER,
        STRUCTURE_OBSERVER,
    ]

    for (const structureType of structureTypes) {
        const positions = bunkerBuildings.get(structureType) || []
        structurePositions.push(...positions)
    }

    // Add natural structures
    structurePositions.push(...sources)
    structurePositions.push(controller)
    structurePositions.push(mineral)

    // Find ramparts that match structure positions
    for (const pos of structurePositions) {
        const key = `${pos.x},${pos.y}`
        if (allRamparts.has(key)) {
            structureProtection.add(key)
        }
    }

    return structureProtection
}

/**
 * Categorizes ramparts into priority groups.
 *
 * @param bunkerRamparts - Rampart positions from the bunker stamp
 * @param allRamparts - All rampart positions
 * @param bunkerBuildings - Map of structure type to positions
 * @param sources - Source positions
 * @param controller - Controller position
 * @param mineral - Mineral position
 * @returns Ramparts categorized by priority
 */
function categorizeRamparts(
    bunkerRamparts: Position[],
    allRamparts: Position[],
    bunkerBuildings: Map<string, Position[]>,
    sources: Position[],
    controller: Position,
    mineral: Position,
): RampartCategories {
    const allRampartsSet = new Set<string>()
    allRamparts.forEach((pos) => allRampartsSet.add(`${pos.x},${pos.y}`))

    const edgeKeys = getBunkerEdgeRamparts(bunkerRamparts)
    const structureKeys = getStructureProtectionRamparts(
        bunkerBuildings,
        sources,
        controller,
        mineral,
        allRampartsSet,
    )

    const edges: Position[] = []
    const structures: Position[] = []
    const others: Position[] = []

    for (const pos of allRamparts) {
        const key = `${pos.x},${pos.y}`
        if (edgeKeys.has(key)) {
            edges.push(pos)
        } else if (structureKeys.has(key)) {
            structures.push(pos)
        } else {
            others.push(pos)
        }
    }

    return { edges, structures, others }
}

/**
 * Calculate rampart positions for a bunker layout
 *
 * Creates a comprehensive rampart network:
 * 1. Starts with bunker stamp ramparts
 * 2. Adds ramparts at sources, mineral, controller
 * 3. Adds ramparts at stationary points (harvesters, link haulers)
 * 4. Adds ramparts at all 8 neighbors of above (excluding walls, including structures)
 * 5. Categorizes by priority: edges → structures → others
 *
 * @param terrain Room terrain data
 * @param bunkerBuildings Map of structure type to positions
 * @param stationaryPoints Calculated stationary points
 * @param sources Array of source positions
 * @param controller Controller position
 * @param mineral Mineral position
 * @returns Array of positions for rampart placement in priority order
 */
export function calculateRamparts(
    terrain: RoomTerrain,
    bunkerBuildings: Map<string, Position[]>,
    stationaryPoints: StationaryPointsResult,
    sources: Position[],
    controller: Position,
    mineral: Position,
): Position[] {
    // Start with bunker stamp ramparts
    const bunkerRamparts = bunkerBuildings.get('rampart') || []
    const rampartSet = new Set<string>()

    // Add bunker ramparts
    bunkerRamparts.forEach((pos) => rampartSet.add(`${pos.x},${pos.y}`))

    // Collect all stationary positions
    const stationaryPositions: Position[] = []

    if (stationaryPoints.controllerLink) {
        stationaryPositions.push(stationaryPoints.controllerLink)
    }
    if (stationaryPoints.storageLink) {
        stationaryPositions.push(stationaryPoints.storageLink)
    }
    if (stationaryPoints.mineral) {
        stationaryPositions.push(stationaryPoints.mineral)
    }
    if (stationaryPoints.sources) {
        Object.values(stationaryPoints.sources).forEach((pos) => stationaryPositions.push(pos))
    }

    // Add ramparts at stationary points and their neighbors
    // Excludes walls and bunker structures (except roads, containers, and links which should have ramparts)
    const allowedStructuresForRamparts = new Set(['road', 'container', 'link', 'rampart'])

    const hasBlockingStructure = (x: number, y: number): boolean => {
        const key = `${x},${y}`
        for (const [structureType, positions] of bunkerBuildings.entries()) {
            if (allowedStructuresForRamparts.has(structureType)) {
                continue
            }
            if (positions.some((pos) => `${pos.x},${pos.y}` === key)) {
                return true
            }
        }
        return false
    }

    for (const pos of stationaryPositions) {
        // Add the position itself
        rampartSet.add(`${pos.x},${pos.y}`)

        // Add all 8 neighbors (excluding walls and blocking structures)
        for (let dx = -1; dx <= 1; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
                if (dx === 0 && dy === 0) continue
                const x = pos.x + dx
                const y = pos.y + dy
                if (x >= 0 && x < 50 && y >= 0 && y < 50) {
                    // Don't add ramparts on walls or bunker structures (except allowed types)
                    if (terrain.get(x, y) !== TERRAIN_MASK_WALL && !hasBlockingStructure(x, y)) {
                        rampartSet.add(`${x},${y}`)
                    }
                }
            }
        }
    }

    // Get important structure positions (sources, mineral, controller)
    const importantStructures: Position[] = []

    // Add sources
    importantStructures.push(...sources)

    // Add mineral
    importantStructures.push(mineral)

    // Add controller
    importantStructures.push(controller)

    // Add ramparts on important structures themselves and their neighbors
    for (const pos of importantStructures) {
        rampartSet.add(`${pos.x},${pos.y}`)

        // Add neighbors (excluding walls and blocking structures)
        for (let dx = -1; dx <= 1; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
                if (dx === 0 && dy === 0) continue
                const x = pos.x + dx
                const y = pos.y + dy
                if (x >= 0 && x < 50 && y >= 0 && y < 50) {
                    if (terrain.get(x, y) !== TERRAIN_MASK_WALL && !hasBlockingStructure(x, y)) {
                        rampartSet.add(`${x},${y}`)
                    }
                }
            }
        }
    }

    // Convert to array
    const allRamparts: Position[] = Array.from(rampartSet).map((key) => {
        const [x, y] = key.split(',').map(Number)
        return { x, y }
    })

    // Categorize ramparts by priority
    const { edges, structures, others } = categorizeRamparts(
        bunkerRamparts,
        allRamparts,
        bunkerBuildings,
        sources,
        controller,
        mineral,
    )

    // Return in priority order: edges first, then structure protection, then everything else
    return [...edges, ...structures, ...others]
}
