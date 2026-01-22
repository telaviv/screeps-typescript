import {
    distanceTransform,
    getPositionsFromTransform,
    sumTransformsFromPositions,
} from '../room-analysis/distance-transform'
import { Position } from '../types'
import { Stamp, StampMetadata } from './types'
import { getStampMetadata } from './utils'

/**
 * Input data needed to place a bunker in a room
 */
export interface BunkerPlacementInput {
    terrain: RoomTerrain
    roomName: string
    sources: Position[]
    controller: Position
    stamp: Stamp
}

/**
 * Result of bunker placement calculation
 */
export interface BunkerPlacementResult {
    success: boolean
    origin: Position | null // Top-left corner of placement bounding box
    center: Position | null // Approximate center of bunker
    buildings: Map<string, Position[]> // Placed building positions by type
    score: number // Sum transform score (lower is better)
    metadata?: {
        stampMetadata: StampMetadata
        possiblePositions: number
        selectedPosition: Position | null
    }
}

/**
 * Get wall positions from terrain (including room edges)
 */
function getWallPositions(terrain: RoomTerrain): Position[] {
    const positions: Position[] = []
    for (let x = 0; x < 50; x++) {
        for (let y = 0; y < 50; y++) {
            if (
                terrain.get(x, y) === TERRAIN_MASK_WALL ||
                [0, 49].includes(x) ||
                [0, 49].includes(y)
            ) {
                positions.push({ x, y })
            }
        }
    }
    return positions
}

/**
 * Places a bunker stamp optimally in a room using distance transforms.
 * Finds position that minimizes total distance to controller and sources.
 *
 * Algorithm:
 * 1. Calculate wall distance transform to find open spaces
 * 2. Calculate sum distance transform from sources + controller
 * 3. Find positions far enough from walls to fit the bunker
 * 4. Sort by sum transform score (prefer positions closer to sources/controller)
 * 5. Translate stamp coordinates to room coordinates
 */
export function placeBunker(input: BunkerPlacementInput): BunkerPlacementResult {
    const { terrain, sources, controller, stamp } = input

    // Combine sources and controller as key positions
    const keyPositions = [controller, ...sources]

    // Calculate distance transforms
    const wallPositions = getWallPositions(terrain)
    const wallTransform = distanceTransform(terrain, wallPositions)
    const sumTransform = sumTransformsFromPositions(terrain, keyPositions)

    // Get stamp dimensions
    const metadata = getStampMetadata(stamp)
    const maxDimension = Math.max(metadata.width, metadata.height)
    const minDistance = Math.ceil(maxDimension / 2)

    // Find positions far enough from walls
    const possiblePositions = getPositionsFromTransform(wallTransform, minDistance)

    if (possiblePositions.length === 0) {
        return {
            success: false,
            origin: null,
            center: null,
            buildings: new Map(),
            score: Infinity,
            metadata: {
                stampMetadata: metadata,
                possiblePositions: 0,
                selectedPosition: null,
            },
        }
    }

    // Sort by sum transform score (lower is better - closer to sources/controller)
    possiblePositions.sort(
        ({ x: xa, y: ya }, { x: xb, y: yb }) => sumTransform[xa][ya] - sumTransform[xb][yb],
    )

    // Select best position
    const bestPosition = possiblePositions[0]
    const score = sumTransform[bestPosition.x][bestPosition.y]

    // Calculate top-left corner of stamp placement
    const topLeft = {
        x: bestPosition.x - minDistance,
        y: bestPosition.y - minDistance,
    }

    // Translate stamp buildings to room coordinates
    const buildings = translateStampToRoom(stamp, topLeft, metadata)

    return {
        success: true,
        origin: topLeft,
        center: bestPosition,
        buildings,
        score,
        metadata: {
            stampMetadata: metadata,
            possiblePositions: possiblePositions.length,
            selectedPosition: bestPosition,
        },
    }
}

/**
 * Translates stamp building positions to room coordinates
 */
function translateStampToRoom(
    stamp: Stamp,
    topLeft: Position,
    metadata: StampMetadata,
): Map<string, Position[]> {
    const buildings = new Map<string, Position[]>()
    const { top, left } = metadata.extants

    for (const [type, positions] of Object.entries(stamp.buildings)) {
        const translatedPositions: Position[] = []

        for (const { x, y } of positions) {
            translatedPositions.push({
                x: topLeft.x + (x - left) + 1,
                y: topLeft.y + (y - top) + 1,
            })
        }

        buildings.set(type, translatedPositions)
    }

    return buildings
}

/**
 * Helper to check if a position is valid (within room bounds)
 */
export function isValidRoomPosition(pos: Position): boolean {
    return pos.x >= 0 && pos.x < 50 && pos.y >= 0 && pos.y < 50
}

/**
 * Helper to check if stamp placement collides with walls
 */
export function checkStampCollision(
    terrain: RoomTerrain,
    buildings: Map<string, Position[]>,
): boolean {
    for (const positions of buildings.values()) {
        for (const pos of positions) {
            if (!isValidRoomPosition(pos)) {
                return true // Out of bounds
            }
            if (terrain.get(pos.x, pos.y) === TERRAIN_MASK_WALL) {
                return true // Collision with wall
            }
        }
    }
    return false
}
