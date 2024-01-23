import filter from 'lodash/filter'

import WarDepartment, { WarStatus } from 'war-department'
import roleClaimer from 'roles/claim'
import roleAttacker from 'roles/attacker'
import roleLogistics from 'roles/logistics'
import roleMason, { MasonCreep } from 'roles/mason'
import roleRemoteUpgrade from 'roles/remote-upgrade'
import roleRemoteBuild from 'roles/remote-build'
import {
    LogisticsCreep,
    LogisticsPreference,
    PREFERENCE_WORKER,
    TASK_BUILDING,
    TASK_HAULING,
    TASK_UPGRADING,
} from 'roles/logistics-constants'
import roleHarvester from 'roles/harvester'
import EnergyManager from 'managers/energy-manager'
import EnergySourceManager from 'managers/energy-source-manager'

const HARVESTERS_PER_SOURCE = 1
const UPGRADERS_COUNT = 1
const BUILDERS_COUNT = 1
const MASON_COUNT = 1
const RESCUE_WORKER_COUNT = 3

const CLAIMERS_COUNT = 3
const ATTACKERS_COUNT = 1
const REMOTE_UPGRADE_COUNT = 1
const REMOTE_BUILD_COUNT = 2

function getCreeps(role: string, room: Room) {
    return filter(Object.keys(Memory.creeps), (creepName: string) => {
        const creep = Game.creeps[creepName]
        return (
            creep &&
            creep.memory.role === role &&
            ((creep.memory.home && creep.memory.home === room.name) ||
                creep.room.name === room.name)
        )
    })
}

function getLogisticsCreeps(preference: LogisticsPreference, room: Room) {
    return filter(Object.keys(Memory.creeps), (creepName: string) => {
        const creep = Game.creeps[creepName] as LogisticsCreep
        return (
            creep &&
            creep.memory.role === 'logistics' &&
            creep.memory.preference === preference &&
            creep.room.name === room.name
        )
    })
}

export default function (spawn: StructureSpawn) {
    updateRescueStatus(spawn.room)

    if (spawn.room.memory.collapsed) {
        createRescueCreeps(spawn)
        return
    }
    const room = spawn.room
    const roomMemory = room.memory
    const sourceCount = roomMemory.sources.length
    const harvesters = getCreeps('harvester', room)
    const masons = getCreeps('mason', room)
    const energyManager = EnergyManager.get(spawn.room)
    const energySourceManager = new EnergySourceManager(room)
    // total energy on the floor or withdrawable buildings
    const energyAvailable = energySourceManager.energyAvailable()
    const warDepartment = new WarDepartment(spawn.room)
    const harvesterSource = energyManager.forceSourceAssignment('harvester')
    const haulers = getLogisticsCreeps(TASK_HAULING, room)
    const upgraders = getLogisticsCreeps(TASK_UPGRADING, room)
    const builders = getLogisticsCreeps(TASK_BUILDING, room)
    const workers = getLogisticsCreeps(PREFERENCE_WORKER, room)

    if (harvesters.length < HARVESTERS_PER_SOURCE * sourceCount) {
        roleHarvester.create(spawn, harvesterSource)
    }

    if (warDepartment.status !== WarStatus.NONE) {
        createWarCreeps(spawn, warDepartment)
    }

    const request = roleLogistics.requestedCarryCapacity(spawn)
    if (energyAvailable < Math.min(request * 3, 0.95 * spawn.room.energyCapacityAvailable)) {
        return
    }

    if (haulers.length < 1) {
        roleLogistics.create(spawn, TASK_HAULING)
    } else if (workers.length < 1) {
        roleLogistics.create(spawn, PREFERENCE_WORKER)
    } else if (upgraders.length < UPGRADERS_COUNT) {
        roleLogistics.create(spawn, TASK_UPGRADING)
    } else if (builders.length < BUILDERS_COUNT) {
        roleLogistics.create(spawn, TASK_BUILDING)
    } else if (masons.length < MASON_COUNT && MasonCreep.shouldCreate(room)) {
        roleMason.create(spawn)
    } else {
        roleLogistics.create(spawn, PREFERENCE_WORKER)
    }
}

function createWarCreeps(spawn: StructureSpawn, warDepartment: WarDepartment) {
    const room = spawn.room
    const status = warDepartment.status
    const attackers = getCreeps('attack', room)
    const claimers = getCreeps('claimer', room)
    const remoteUpgraders = getCreeps('remote-upgrade', room)
    const remoteBuilders = getCreeps('remote-build', room)

    if (status === WarStatus.ATTACK && attackers.length < ATTACKERS_COUNT) {
        roleAttacker.create(spawn, warDepartment.target)
    } else if (status === WarStatus.CLAIM && claimers.length < CLAIMERS_COUNT) {
        roleClaimer.create(spawn, warDepartment.target)
    } else if (status === WarStatus.SPAWN) {
        if (remoteUpgraders.length < REMOTE_UPGRADE_COUNT) {
            roleRemoteUpgrade.create(spawn, warDepartment.target)
        } else if (remoteBuilders.length < REMOTE_BUILD_COUNT) {
            roleRemoteBuild.create(spawn, warDepartment.target)
        }
    }
}

function createRescueCreeps(spawn: StructureSpawn) {
    const room = spawn.room
    const roomMemory = room.memory
    const sourceCount = roomMemory.sources.length
    const energyManager = EnergyManager.get(spawn.room)
    const harvesterSource = energyManager.forceSourceAssignment('harvester')
    const harvesters = getCreeps('harvester', room)
    const workers = getLogisticsCreeps(PREFERENCE_WORKER, room)

    if (workers.length < RESCUE_WORKER_COUNT) {
        roleLogistics.create(spawn, PREFERENCE_WORKER, true)
    } else if (harvesters.length < sourceCount) {
        roleHarvester.create(spawn, harvesterSource, true)
    }
}

function updateRescueStatus(room: Room) {
    const roomMemory = room.memory
    const sourceCount = roomMemory.sources.length
    const haulers = getLogisticsCreeps(TASK_HAULING, room)
    const workers = getLogisticsCreeps(PREFERENCE_WORKER, room)
    const haulerCount = haulers.length + workers.length
    const harvesters = getCreeps('harvester', room)
    if (
        room.memory.collapsed &&
        haulerCount >= RESCUE_WORKER_COUNT &&
        harvesters.length >= sourceCount
    ) {
        room.memory.collapsed = false
    } else if (!room.memory.collapsed && haulerCount < sourceCount) {
        room.memory.collapsed = true
    }
}
