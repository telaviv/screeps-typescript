import roleBuilder from 'roles/builder'
import roleHarvester from 'roles/harvester'
import roleLogistics from 'roles/logistics'
import roleUpgrader from 'roles/upgrader'

interface RoleCounts {
    [index: string]: number
}

const LOGISTICS_MULTIPLE = 3

export default function runSpawn(spawn: StructureSpawn) {
    const role = getMostNeededRole(spawn.room)
    if (role === 'harvester') {
	roleHarvester.create(spawn)
    } else if (role === 'builder') {
        roleBuilder.create(spawn)
    } else if (role === 'logistics') {
        roleLogistics.create(spawn)
    } else if (role === 'upgrader') {
        roleUpgrader.create(spawn)
    }
}

function getSourceCount(room: Room) {
    return Memory.rooms[room.name].sources.length
}


function getMostNeededRole(room: Room) {
    const roleCounts = getRoleCounts()
    const sourceCount = getSourceCount(room)
    if (roleCounts.harvester < sourceCount) {
	return 'harvester'
    } else if (roleCounts.logistics < sourceCount * LOGISTICS_MULTIPLE) {
        return 'logistics'
    } else if (roleCounts.builder < 1) {
        return 'builder'
    }
    return 'upgrader'
}

function getRoleCounts(): RoleCounts {
    const counts: RoleCounts = { harvester: 0, logistics: 0, builder: 0, upgrader: 0 }
    for (const creep of Object.values(Memory.creeps)) {
        counts[creep.role] += 1
    }
    return counts
}
