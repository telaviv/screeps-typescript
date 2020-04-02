import filter from 'lodash/filter'

import roleHarvester from 'roles/harvester'
import roleLogistics, {
    Logistics,
    DeliveryTask,
    TASK_HAULING,
    TASK_UPGRADING,
} from 'roles/logistics'
import EnergyManager from 'managers/energy-manager'

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
    const energyManager = EnergyManager.get(spawn.room)
    const logisticsSource = energyManager.forceSourceAssignment('logistics')
    const harvesterSource = energyManager.forceSourceAssignment('harvester')
    const harvesters = getCreeps('harvester', room)
    const haulers = getLogisticsCreeps(TASK_HAULING, room)
    const upgraders = getLogisticsCreeps(TASK_UPGRADING, room)
    if (haulers.length < sourceCount) {
        roleLogistics.create(spawn, logisticsSource, TASK_HAULING)
    } else if (harvesters.length < sourceCount) {
        roleHarvester.create(spawn, harvesterSource)
    }

    const request = roleLogistics.requestedCarryCapacity(spawn)
    const assignment = energyManager.findLogisticsAssignment(request)
    if (assignment === null) {
        return
    }

    if (haulers.length < HAULERS_PER_SOURCE * sourceCount) {
        roleLogistics.create(spawn, assignment, TASK_HAULING)
    } else if (upgraders.length < UPGRADERS_PER_SOURCE * sourceCount) {
        roleLogistics.create(spawn, assignment, TASK_UPGRADING)
    } else {
        roleLogistics.create(spawn, assignment, TASK_HAULING)
    }
}
