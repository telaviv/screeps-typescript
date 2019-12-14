import roleBuilder from 'roles/builder'
import roleHarvester from 'roles/logistics'
import roleUpgrader from 'roles/upgrader'

interface RoleCounts {
    [index: string]: number
}

const MINIMUM_LOGISTICS_COUNT = 6
const MINIMUM_UPGRADE_COUNT = 1

export default function runSpawn(spawn: StructureSpawn) {
    const role = getMostNeededRole()
    if (role === 'builder') {
        roleBuilder.create(spawn)
    } else if (role === 'logistics') {
        roleHarvester.create(spawn)
    } else if (role === 'upgrader') {
        roleUpgrader.create(spawn)
    }
}

function calculateBuilderCount() {
    // TODO: this needs to be a per room thing.
    const constructionSiteCount = Object.keys(Game.constructionSites).length
    return Math.ceil(constructionSiteCount / 100)
}

function getMostNeededRole() {
    const roleCounts = getRoleCounts()
    if (roleCounts.logistics < MINIMUM_LOGISTICS_COUNT) {
        return 'logistics'
    } else if (roleCounts.builder < calculateBuilderCount()) {
        return 'builder'
    }
    return 'upgrader'
}

function getRoleCounts(): RoleCounts {
    const counts: RoleCounts = { logistics: 0, builder: 0, upgrader: 0 }
    for (const creep of Object.values(Memory.creeps)) {
        counts[creep.role] += 1
    }
    return counts
}
