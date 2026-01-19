import DefenseDepartment from 'defense-department'
import { getInjuredCreeps, isFragileWall } from 'utils/room'

/** Interval in ticks between tower repair checks */
const TOWER_CHECK_TIME = 5

/**
 * Executes tower logic: attacks hostiles or repairs damaged roads.
 * When overwhelming healing is detected, prioritizes healing and repairs over attacking.
 * @param tower - The tower structure to run
 */
function runTower(tower: StructureTower): void {
    const room = tower.room
    const defenseDepartment = new DefenseDepartment(room)
    const hasOverwhelmingHealing = defenseDepartment.hasOverwhelmingHealing()

    // Priority 1: Heal injured friendly creeps
    const injuredCreeps = getInjuredCreeps(room)
    if (injuredCreeps.length > 0) {
        const closestInjured = tower.pos.findClosestByRange(injuredCreeps)
        if (closestInjured) {
            tower.heal(closestInjured)
            return
        }
    }

    // Priority 2: If overwhelming healing, focus on repairs instead of attacking
    if (hasOverwhelmingHealing) {
        if (Game.time % TOWER_CHECK_TIME === 0) {
            // First priority: repair fragile walls
            const fragileWalls = room.find(FIND_STRUCTURES, {
                filter: (s) => isFragileWall(s),
            })
            if (fragileWalls.length > 0) {
                const closestWall = tower.pos.findClosestByRange(fragileWalls)
                if (closestWall) {
                    tower.repair(closestWall)
                    return
                }
            }

            // Second priority: repair other damaged structures
            const closestDamagedStructure = tower.pos.findClosestByRange(FIND_STRUCTURES, {
                filter: isDamaged,
            })
            if (closestDamagedStructure) {
                tower.repair(closestDamagedStructure)
                return
            }
        }
        // Don't attack when overwhelming healing - they'll just heal through it
        return
    }

    // Normal mode: attack hostiles first
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
