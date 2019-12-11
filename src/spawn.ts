import roleBuilder from 'roles/builder'
import roleHarvester from 'roles/harvester'
import roleUpgrader from 'roles/upgrader'

interface RoleCounts {
    [index: string]: number
}

const MINIMUM_HARVESTER_COUNT = 6
const MINIMUM_BUILDER_COUNT = 1
const MINIMUM_UPGRADE_COUNT = 1

function runSpawn(spawn: StructureSpawn) {
    const role = getMostNeededRole()
    if (role === 'builder') {
        roleBuilder.create(spawn)
    } else if (role === 'harvester') {
        roleHarvester.create(spawn)
    } else if (role === 'upgrader') {
        roleUpgrader.create(spawn)
    }
}

function getMostNeededRole() {
    const roleCounts = getRoleCounts()
    if (roleCounts.harvester < MINIMUM_HARVESTER_COUNT) {
        return 'harvester'
    } else if (roleCounts.builder < MINIMUM_BUILDER_COUNT) {
        return 'builder'
    }
    return 'upgrader'
}

function getRoleCounts(): RoleCounts {
    const counts: RoleCounts = { harvester: 0, builder: 0, upgrader: 0 }
    for (const creep of Object.values(Memory.creeps)) {
        counts[creep.role] += 1
    }
    return counts
}

export { runSpawn }
