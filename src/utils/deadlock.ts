import { DEADLOCK_THRESHOLD } from '../constants'
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
 * Checks if a creep is stuck at the same position as last tick
 * @param creep - The creep to check
 * @returns True if the creep hasn't moved since last tick
 */
export const isCreepStuck = wrap((creep: Creep): boolean => {
    // eslint-disable-next-line no-underscore-dangle
    if (!creep.memory._dlPos) {
        return false
    }
    const currentPos = serializePosition(creep.pos)
    // eslint-disable-next-line no-underscore-dangle
    return creep.memory._dlPos === currentPos
}, 'deadlock:isCreepStuck')

/**
 * Increments the wait counter for a stuck creep
 * @param creep - The creep that is stuck
 */
export const incrementWaitCounter = wrap((creep: Creep): void => {
    // eslint-disable-next-line no-underscore-dangle
    const currentWait: number = creep.memory._dlWait ?? 0
    // eslint-disable-next-line no-underscore-dangle
    creep.memory._dlWait = currentWait + 1
    // eslint-disable-next-line no-underscore-dangle
    creep.memory._dlPos = serializePosition(creep.pos)
}, 'deadlock:incrementWaitCounter')

/**
 * Resets the wait counter when a creep successfully moves
 * @param creep - The creep that moved
 */
export const resetWaitCounter = wrap((creep: Creep): void => {
    // eslint-disable-next-line no-underscore-dangle
    creep.memory._dlWait = 0 as number
    // eslint-disable-next-line no-underscore-dangle
    creep.memory._dlPos = serializePosition(creep.pos)
}, 'deadlock:resetWaitCounter')

/**
 * Checks if a creep should break deadlock based on wait time
 * @param creep - The creep to check
 * @param threshold - The wait time threshold (defaults to DEADLOCK_THRESHOLD)
 * @returns True if the creep has been stuck for >= threshold ticks
 */
export const shouldBreakDeadlock = wrap((creep: Creep, threshold = DEADLOCK_THRESHOLD): boolean => {
    // eslint-disable-next-line no-underscore-dangle
    const currentWait: number = creep.memory._dlWait ?? 0
    return currentWait >= threshold
}, 'deadlock:shouldBreakDeadlock')

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
        resetWaitCounter(creep)
        return creep.move(randomDir)
    }

    // Move to the random position
    resetWaitCounter(creep)
    // creep.moveTo can return error codes not in CreepMoveReturnCode, cast to match expected type
    return creep.moveTo(randomPos, { range: 0 }) as CreepMoveReturnCode
}, 'deadlock:moveToRandomNearbyPosition')

/**
 * Updates position tracking after a movement attempt
 * Should be called after every moveTo call to track if the creep actually moved
 * @param creep - The creep that attempted to move
 * @param previousPos - The position before the move attempt
 */
export const updatePositionTracking = wrap((creep: Creep, previousPos: RoomPosition): void => {
    const currentPos = serializePosition(creep.pos)
    const prevPosStr = serializePosition(previousPos)

    if (currentPos === prevPosStr) {
        // Creep didn't move, increment wait counter
        incrementWaitCounter(creep)
    } else {
        // Creep moved successfully, reset counter
        resetWaitCounter(creep)
    }
}, 'deadlock:updatePositionTracking')
