const BUILD_ORDER: BuildableStructureConstant[] = [
    STRUCTURE_SPAWN,
    STRUCTURE_STORAGE,
    STRUCTURE_EXTENSION,
    STRUCTURE_LINK,
    STRUCTURE_TERMINAL,
    STRUCTURE_CONTAINER,
    STRUCTURE_TOWER,
    STRUCTURE_POWER_SPAWN,
    STRUCTURE_LAB,
    STRUCTURE_NUKER,
    STRUCTURE_FACTORY,
    STRUCTURE_EXTRACTOR,
    STRUCTURE_OBSERVER,
    STRUCTURE_RAMPART,
    STRUCTURE_ROAD,
    STRUCTURE_WALL,
]

export function isMoving(room: Room): boolean {
    return room.memory.constructionFeaturesV3?.movement !== undefined
}

export function getNextDismantleTarget(room: Room): Structure | null {
    if (!room.memory.constructionFeaturesV3?.movement) {
        return null
    }
    const movement = room.memory.constructionFeaturesV3.movement
    for (const structureType of BUILD_ORDER) {
        const movementStructures = movement[structureType]
        if (!movementStructures) {
            continue
        }
        for (let i = movementStructures.moveTo.length - 1; i >= 0; i--) {
            const pos = movementStructures.moveTo[i]
            const structures = room
                .lookForAt<LOOK_STRUCTURES>(LOOK_STRUCTURES, pos.x, pos.y)
                .filter((s) => s.structureType === structureType)
            if (structures.length === 0) {
                movementStructures.moveTo.splice(i, 1)
            } else {
                return structures[0]
            }
        }
        for (let i = movementStructures.moveFrom.length - 1; i >= 0; i--) {
            const pos = movementStructures.moveFrom[i]
            const structures = room
                .lookForAt<LOOK_STRUCTURES>(LOOK_STRUCTURES, pos.x, pos.y)
                .filter((s) => s.structureType === structureType)
            if (structures.length === 0) {
                movementStructures.moveFrom.splice(i, 1)
            } else {
                return structures[0]
            }
        }
        delete movement[structureType]
    }
    delete room.memory.constructionFeaturesV3.movement
    return null
}
