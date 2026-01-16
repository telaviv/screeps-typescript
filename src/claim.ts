/**
 * Checks if a room is a valid candidate for claiming.
 * Requires 2 sources, no enemy ownership, no active mining by enemies, and unblocked controller.
 * @param roomMemory - The room's memory containing scout data
 * @returns True if the room can be claimed
 */
export function canBeClaimCandidate(roomMemory: RoomMemory): boolean {
    const memory = roomMemory.scout
    return Boolean(
        memory &&
            memory.sourceCount === 2 &&
            (memory.controllerOwner ?? global.USERNAME) === global.USERNAME &&
            !memory.enemyThatsMining &&
            !memory.controllerBlocked,
    )
}
