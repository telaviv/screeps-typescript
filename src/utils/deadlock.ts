/**
 * Tracks whether a creep actually moved since the last tick by comparing its current
 * position to the position stored in `_dlPos` from the previous tick.
 *
 * Must be called once per tick at the start of each top-level movement function.
 * Updates both `_dlWait` (stuck counter) and `_dlPos` (position snapshot for next tick).
 *
 * @param creep - The creep about to move
 */
export function trackPosition(creep: Creep): void {
    const currentPosKey = `${creep.pos.x},${creep.pos.y},${creep.pos.roomName}`
    const lastPos = creep.memory._dlPos

    if (!lastPos || lastPos !== currentPosKey) {
        // Creep moved since last tick (or first tick) — reset counter
        // eslint-disable-next-line no-underscore-dangle
        creep.memory._dlWait = 0
    } else {
        // Creep is at the same position as last tick — increment stuck counter
        // eslint-disable-next-line no-underscore-dangle
        creep.memory._dlWait = (creep.memory._dlWait ?? 0) + 1
    }

    // Record current position for comparison next tick
    // eslint-disable-next-line no-underscore-dangle
    creep.memory._dlPos = currentPosKey
}
