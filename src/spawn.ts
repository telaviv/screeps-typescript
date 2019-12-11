import roleBuilder from 'roles/builder'
import roleHarvester from 'roles/harvester'
import roleUpgrader from 'roles/upgrader'

interface RoleCounts {
    [index: string]: number
}

const MINIMUM_HARVESTER_COUNT = 6
const MINIMUM_UPGRADE_COUNT = 1

function runSpawn(spawn: StructureSpawn) {
    const role = getMostNeededRole()
    console.log('most needed role:', role)
    if (role === 'builder') {
        roleBuilder.create(spawn)
    } else if (role === 'harvester') {
        roleHarvester.create(spawn)
    } else if (role === 'upgrader') {
        roleUpgrader.create(spawn)
    }
}

function calculateBuilderCount() {
    // TODO: this needs to be a per room thing.
    const constructionSiteCount = Object.keys(Game.constructionSites).length
    return Math.ceil(constructionSiteCount / 10)
}

function getMostNeededRole() {
    const roleCounts = getRoleCounts()
    if (roleCounts.harvester < MINIMUM_HARVESTER_COUNT) {
        return 'harvester'
    } else if (roleCounts.builder < calculateBuilderCount()) {
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
