export const ALL_BUILDABLE_STRUCTURES: BuildableStructureConstant[] = [
    STRUCTURE_EXTENSION,
    STRUCTURE_RAMPART,
    STRUCTURE_ROAD,
    STRUCTURE_SPAWN,
    STRUCTURE_LINK,
    STRUCTURE_WALL,
    STRUCTURE_STORAGE,
    STRUCTURE_TOWER,
    STRUCTURE_OBSERVER,
    STRUCTURE_POWER_SPAWN,
    STRUCTURE_EXTRACTOR,
    STRUCTURE_LAB,
    STRUCTURE_TERMINAL,
    STRUCTURE_CONTAINER,
    STRUCTURE_NUKER,
    STRUCTURE_FACTORY,
]

export function isBuildableStructureConstant(
    structure: string,
): structure is BuildableStructureConstant {
    return ALL_BUILDABLE_STRUCTURES.includes(structure as BuildableStructureConstant)
}

export const MAX_SAVIOR_DISTANCE = 3
export const MAX_CLAIM_DISTANCE = 3
export const ENEMY_DISTANCE_BUFFER = 1
