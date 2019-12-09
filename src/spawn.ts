import roleBuilder from 'roles/builder'
import roleHarvester from 'roles/harvester'
import roleUpgrader from 'roles/upgrader'
import { minBy } from 'utils/lodash'

interface RoleCounts {
    [index: string]: number
}

function runSpawn(spawn: StructureSpawn) {
    const role = getMostNeededRole()
    console.log('most needed role', role)
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
    console.log('role counts', JSON.stringify(roleCounts))
    return minBy(Object.keys(roleCounts), role => roleCounts[role])
}

function getRoleCounts(): RoleCounts {
    const counts: RoleCounts = { harvester: 0, builder: 0, upgrader: 0 }
    for (const creep of Object.values(Memory.creeps)) {
        counts[creep.role] += 1
    }
    return counts
}

export { runSpawn }
