/** All structure types that can be built via construction sites */
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

/**
 * Type guard to check if a string is a valid buildable structure type.
 * @param structure - The string to check
 */
export function isBuildableStructureConstant(
    structure: string,
): structure is BuildableStructureConstant {
    return ALL_BUILDABLE_STRUCTURES.includes(structure as BuildableStructureConstant)
}

/** Maximum room distance for sending savior creeps to rebuild a lost room */
export const MAX_SAVIOR_DISTANCE = 5
/** Maximum room distance for claiming a new room */
export const MAX_CLAIM_DISTANCE = 5
/** Minimum distance buffer from enemy rooms when selecting claim targets */
export const ENEMY_DISTANCE_BUFFER = 1
/** Number of ticks a creep must be stuck before triggering deadlock resolution */
// export const DEADLOCK_THRESHOLD = 10
export const DEADLOCK_THRESHOLD = Infinity
