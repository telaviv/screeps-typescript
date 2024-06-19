function runTower(tower: StructureTower) {
    const closestHostile = tower.pos.findClosestByRange(FIND_HOSTILE_CREEPS)

    if (closestHostile) {
        tower.attack(closestHostile)
    } else {
        const closestDamagedStructure = tower.pos.findClosestByRange(FIND_STRUCTURES, {
            filter: isDamaged,
        })
        if (closestDamagedStructure) {
            tower.repair(closestDamagedStructure)
        }
    }
}

function isDamaged(structure: Structure): boolean {
    return structure.hitsMax - structure.hits > 50 && structure.structureType === STRUCTURE_ROAD
}

export { isDamaged, runTower }
