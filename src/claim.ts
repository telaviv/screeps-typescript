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
