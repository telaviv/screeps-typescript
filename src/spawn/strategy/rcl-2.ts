import filter from 'lodash/filter'

import roleLogistics from 'roles/logistics'
import {
    Logistics,
    LogisticsPreference,
    PREFERENCE_WORKER,
    TASK_HAULING,
    TASK_BUILDING,
    TASK_UPGRADING,
} from 'roles/logistics-constants'
import roleHarvester from 'roles/harvester'
import EnergyManager from 'managers/energy-manager'

const HAULERS_PER_SOURCE = 1
const HARVESTERS_PER_SOURCE = 1
const UPGRADERS_COUNT = 1
const BUILDERS_COUNT = 1

function getCreeps(role: string, room: Room) {
    return filter(Object.keys(Memory.creeps), creepName => {
        const creep = Game.creeps[creepName]
        return (
            creep && creep.memory.role === role && creep.room.name === room.name
        )
    })
}

function getLogisticsCreeps(preference: LogisticsPreference, room: Room) {
    return filter(Object.keys(Memory.creeps), creepName => {
        const creep = Game.creeps[creepName] as Logistics
        return (
            creep &&
            creep.memory.role === 'logistics' &&
            creep.memory.preference === preference &&
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
    const workers = getLogisticsCreeps(PREFERENCE_WORKER, room)
    if (harvesters.length < HARVESTERS_PER_SOURCE * sourceCount) {
        roleHarvester.create(spawn, harvesterSource)
    }

    const request = roleLogistics.requestedCarryCapacity(spawn)
    const assignment = energyManager.findLogisticsAssignment(
        Math.min(request * 3, 1900),
    )
    if (assignment === null) {
        return
    }

    if (haulers.length < 1) {
        roleLogistics.create(spawn, assignment, TASK_HAULING)
    } else if (workers.length < 1) {
        roleLogistics.create(spawn, assignment, PREFERENCE_WORKER)
    } else if (haulers.length < HAULERS_PER_SOURCE * sourceCount) {
        roleLogistics.create(spawn, assignment, TASK_HAULING)
    } else if (upgraders.length < UPGRADERS_COUNT) {
        roleLogistics.create(spawn, assignment, TASK_UPGRADING)
    } else if (builders.length < BUILDERS_COUNT) {
        roleLogistics.create(spawn, assignment, TASK_BUILDING)
    } else {
        roleLogistics.create(spawn, assignment, PREFERENCE_WORKER)
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
    const workers = getLogisticsCreeps(PREFERENCE_WORKER, room)

    if (workers.length < sourceCount) {
        roleLogistics.create(spawn, logisticsSource, PREFERENCE_WORKER, true)
    } else if (harvesters.length < sourceCount) {
        roleHarvester.create(spawn, harvesterSource)
    }
}

function updateRescueStatus(room: Room) {
    const roomMemory = room.memory
    const sourceCount = roomMemory.sources.length
    const workers = getLogisticsCreeps(PREFERENCE_WORKER, room)
    const harvesters = getCreeps('harvester', room)
    if (
        room.memory.collapsed &&
        workers.length >= sourceCount &&
        harvesters.length >= sourceCount
    ) {
        room.memory.collapsed = false
    } else if (!room.memory.collapsed && workers.length < sourceCount) {
        room.memory.collapsed = true
    }
}
