const TOWER_CHECK_TIME = 5

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

function isDamaged(structure: Structure): boolean {
    return structure.hitsMax - structure.hits > 150 && structure.structureType === STRUCTURE_ROAD
}

export { isDamaged, runTower }
