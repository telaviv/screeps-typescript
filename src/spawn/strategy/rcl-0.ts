import filter from 'lodash/filter'

import roleLogistics, {
    Logistics,
    DeliveryTask,
    TASK_HAULING,
    TASK_UPGRADING,
} from 'roles/logistics'
import roleUpgrader from 'roles/upgrader'

const HAULERS_PER_SOURCE = 3
const UPGRADERS_PER_SOURCE = 3

function getLogisticsCreeps(task: DeliveryTask, room: Room) {
    return filter(Object.keys(Memory.creeps), creepName => {
        const creep = Game.creeps[creepName] as Logistics
        return (
            creep &&
            creep.memory.role === 'logistics' &&
            creep.memory.preference === task &&
            creep.room.name === room.name
        )
    })
}

export default function(spawn: StructureSpawn) {
    const room = spawn.room
    const roomMemory = room.memory
    const sourceCount = roomMemory.sources.length
    const haulers = getLogisticsCreeps(TASK_HAULING, room)
    const upgraders = getLogisticsCreeps(TASK_UPGRADING, room)
    if (haulers.length < HAULERS_PER_SOURCE * sourceCount) {
        roleLogistics.create(spawn, TASK_HAULING)
    } else if (upgraders.length < UPGRADERS_PER_SOURCE * sourceCount) {
        roleLogistics.create(spawn, TASK_UPGRADING)
    }
}
