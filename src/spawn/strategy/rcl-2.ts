import filter from 'lodash/filter'

import roleLogistics from 'roles/logistics'
import roleUpgrader from 'roles/upgrader'
import roleHarvester from 'roles/harvester'
import roleBuilder from 'roles/builder'

const LOGISTICS_PER_SOURCE = 3
const UPGRADERS_PER_SOURCE = 1
const HARVESTERS_PER_SOURCE = 1
const BUILDERS_PER_SOURCE = 3

function getCreeps(role: string, room: Room) {
    return filter(Object.keys(Memory.creeps), creepName => {
        const creep = Game.creeps[creepName]
        return (
            creep && creep.memory.role === role && creep.room.name === room.name
        )
    })
}

export default function(spawn: StructureSpawn) {
    const room = spawn.room
    const roomMemory = room.memory
    const sourceCount = roomMemory.sources.length
    const logistics = getCreeps('logistics', room)
    const upgraders = getCreeps('upgrader', room)
    const harvesters = getCreeps('harvester', room)
    const builders = getCreeps('builder', room)
    if (harvesters.length < HARVESTERS_PER_SOURCE * sourceCount) {
        roleHarvester.create(spawn)
    } else if (logistics.length < LOGISTICS_PER_SOURCE * sourceCount) {
        roleLogistics.create(spawn)
    } else if (builders.length < BUILDERS_PER_SOURCE * sourceCount) {
        roleBuilder.create(spawn)
    } else if (upgraders.length < UPGRADERS_PER_SOURCE * sourceCount) {
        roleUpgrader.create(spawn)
    }
}
