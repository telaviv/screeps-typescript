export function canBeClaimCandidate(roomMemory: RoomMemory): boolean {
    const memory = roomMemory.scout
    return Boolean(
        memory &&
            memory.sourceCount === 2 &&
            !memory.controllerOwner &&
            !memory.enemyThatsMining &&
            !memory.controllerBlocked,
    )
}
