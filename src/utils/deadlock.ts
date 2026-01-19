import { wrap } from './profiling'

/**
 * Serializes a position to a string for comparison
 * @param pos - The position to serialize
 * @returns A string in the format "x,y,roomName"
 */
function serializePosition(pos: RoomPosition): string {
    return `${pos.x},${pos.y},${pos.roomName}`
}

/**
 * Finds a random walkable position within range 3-5 of the creep
 * @param creep - The creep to find a position for
 * @returns A random walkable position, or null if none found
 */
function findRandomNearbyPosition(creep: Creep): RoomPosition | null {
    const terrain = new Room.Terrain(creep.room.name)
    const candidates: RoomPosition[] = []

    // Search in range 3-5 for walkable tiles
    for (let dx = -5; dx <= 5; dx++) {
        for (let dy = -5; dy <= 5; dy++) {
            const distance = Math.abs(dx) + Math.abs(dy)
            if (distance < 3 || distance > 5) continue

            const x = creep.pos.x + dx
            const y = creep.pos.y + dy

            // Check bounds
            if (x < 1 || x > 48 || y < 1 || y > 48) continue

            // Check if walkable
            if (terrain.get(x, y) !== TERRAIN_MASK_WALL) {
                candidates.push(new RoomPosition(x, y, creep.room.name))
            }
        }
    }

    if (candidates.length === 0) {
        return null
    }

    // Return a random candidate
    return candidates[Math.floor(Math.random() * candidates.length)]
}

/**
 * Moves a creep to a random nearby position to break deadlock
 * @param creep - The creep to move
 * @returns The return code from the move attempt
 */
export const moveToRandomNearbyPosition = wrap((creep: Creep): CreepMoveReturnCode => {
    const randomPos = findRandomNearbyPosition(creep)

    if (!randomPos) {
        // No valid position found, just try to move in a random direction
        const directions: DirectionConstant[] = [
            TOP,
            TOP_RIGHT,
            RIGHT,
            BOTTOM_RIGHT,
            BOTTOM,
            BOTTOM_LEFT,
            LEFT,
            TOP_LEFT,
        ]
        const randomDir = directions[Math.floor(Math.random() * directions.length)]
        // eslint-disable-next-line no-underscore-dangle
        creep.memory._dlWait = 0
        // eslint-disable-next-line no-underscore-dangle
        creep.memory._dlPos = serializePosition(creep.pos)
        return creep.move(randomDir)
    }

    // Move to the random position
    // eslint-disable-next-line no-underscore-dangle
    creep.memory._dlWait = 0
    // eslint-disable-next-line no-underscore-dangle
    creep.memory._dlPos = serializePosition(creep.pos)
    // creep.moveTo can return error codes not in CreepMoveReturnCode, cast to match expected type
    return creep.moveTo(randomPos, { range: 0 }) as CreepMoveReturnCode
}, 'deadlock:moveToRandomNearbyPosition')

/**
 * Optimized position tracking after a movement attempt
 * Only serializes positions once and uses early exits
 * @param creep - The creep that attempted to move
 * @param previousPos - The position before the move attempt
 */
export function updatePositionTracking(creep: Creep, previousPos: RoomPosition): void {
    // Early exit: If creep moved (different x, y, or room), reset and return
    if (
        creep.pos.x !== previousPos.x ||
        creep.pos.y !== previousPos.y ||
        creep.pos.roomName !== previousPos.roomName
    ) {
        // eslint-disable-next-line no-underscore-dangle
        creep.memory._dlWait = 0
        // eslint-disable-next-line no-underscore-dangle
        creep.memory._dlPos = serializePosition(creep.pos)
        return
    }

    // Creep didn't move - increment wait counter
    // eslint-disable-next-line no-underscore-dangle
    const currentWait: number = creep.memory._dlWait ?? 0
    // eslint-disable-next-line no-underscore-dangle
    creep.memory._dlWait = currentWait + 1
    // eslint-disable-next-line no-underscore-dangle
    creep.memory._dlPos = serializePosition(creep.pos)
}
