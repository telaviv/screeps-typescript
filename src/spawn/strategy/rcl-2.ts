import filter from 'lodash/filter'

import roleLogistics, {
    Logistics,
    DeliveryTask,
    TASK_HAULING,
    TASK_BUILDING,
    TASK_UPGRADING,
} from 'roles/logistics'
import roleHarvester from 'roles/harvester'
import EnergyManager from 'managers/energy-manager'

const HAULERS_PER_SOURCE = 3
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
    updateRescueStatus(spawn.room)

    if (spawn.room.memory.collapsed) {
        createRescueCreeps(spawn)
        return
    }
    const room = spawn.room
    const roomMemory = room.memory
    const sourceCount = roomMemory.sources.length
    const harvesters = getCreeps('harvester', room)
    const energyManager = EnergyManager.get(spawn.room)
    const harvesterSource = energyManager.forceSourceAssignment('harvester')
    const haulers = getLogisticsCreeps(TASK_HAULING, room)
    const upgraders = getLogisticsCreeps(TASK_UPGRADING, room)
    const builders = getLogisticsCreeps(TASK_BUILDING, room)
    if (harvesters.length < HARVESTERS_PER_SOURCE * sourceCount) {
        roleHarvester.create(spawn, harvesterSource)
    }

    const request = roleLogistics.requestedCarryCapacity(spawn)
    const assignment = energyManager.findLogisticsAssignment(request)
    if (assignment === null) {
        return
    }

    if (haulers.length < HAULERS_PER_SOURCE * sourceCount) {
        roleLogistics.create(spawn, assignment, TASK_HAULING)
    } else if (builders.length < BUILDERS_PER_SOURCE * sourceCount) {
        roleLogistics.create(spawn, assignment, TASK_BUILDING)
    } else if (upgraders.length < UPGRADERS_PER_SOURCE * sourceCount) {
        roleLogistics.create(spawn, assignment, TASK_UPGRADING)
    } else {
        roleLogistics.create(spawn, assignment, TASK_HAULING)
    }
}

function createRescueCreeps(spawn: StructureSpawn) {
    const room = spawn.room
    const roomMemory = room.memory
    const sourceCount = roomMemory.sources.length
    const energyManager = EnergyManager.get(spawn.room)
    const logisticsSource = energyManager.forceSourceAssignment('logistics')
    const harvesterSource = energyManager.forceSourceAssignment('harvester')
    const harvesters = getCreeps('harvester', room)
    const haulers = getLogisticsCreeps(TASK_HAULING, room)
    if (haulers.length < sourceCount) {
        roleLogistics.create(spawn, logisticsSource, TASK_HAULING, true)
    } else if (harvesters.length < sourceCount) {
        roleHarvester.create(spawn, harvesterSource)
    }
}

function updateRescueStatus(room: Room) {
    const roomMemory = room.memory
    const sourceCount = roomMemory.sources.length
    const haulers = getLogisticsCreeps(TASK_HAULING, room)
    const harvesters = getCreeps('harvester', room)
    if (
        room.memory.collapsed &&
        haulers.length >= sourceCount &&
        harvesters.length >= sourceCount
    ) {
        room.memory.collapsed = false
    } else if (!room.memory.collapsed && haulers.length < sourceCount) {
        room.memory.collapsed = true
    }
}
