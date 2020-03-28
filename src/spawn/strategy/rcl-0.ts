import filter from 'lodash/filter'

import roleLogistics from 'roles/logistics'
import roleUpgrader from 'roles/upgrader'

const LOGISTICS_PER_SOURCE = 3
const UPGRADERS_PER_SOURCE = 3

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
    if (logistics.length < LOGISTICS_PER_SOURCE * sourceCount) {
        roleLogistics.create(spawn)
    } else if (upgraders.length < UPGRADERS_PER_SOURCE * sourceCount) {
        roleUpgrader.create(spawn)
    }
}
