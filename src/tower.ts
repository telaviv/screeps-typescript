/** Interval in ticks between tower repair checks */
const TOWER_CHECK_TIME = 5

/**
 * Executes tower logic: attacks hostiles or repairs damaged roads.
 * @param tower - The tower structure to run
 */
function runTower(tower: StructureTower): void {
    const closestHostile = tower.pos.findClosestByRange(FIND_HOSTILE_CREEPS)

    if (closestHostile) {
        tower.attack(closestHostile)
    } else if (Game.time % TOWER_CHECK_TIME === 0) {
        const closestDamagedStructure = tower.pos.findClosestByRange(FIND_STRUCTURES, {
            filter: isDamaged,
        })
        if (closestDamagedStructure) {
            tower.repair(closestDamagedStructure)
        }
    }
}

/**
 * Checks if a road structure needs repair (>150 hits missing).
 * @param structure - The structure to check
 */
function isDamaged(structure: Structure): boolean {
    return structure.hitsMax - structure.hits > 150 && structure.structureType === STRUCTURE_ROAD
}

export { isDamaged, runTower }
