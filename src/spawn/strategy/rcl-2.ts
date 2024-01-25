
import WarDepartment, { WarStatus } from 'war-department'
import roleClaimer from 'roles/claim'
import roleAttacker from 'roles/attacker'
import RoleLogistics from 'roles/logistics'
import roleMason, { MasonCreep } from 'roles/mason'
import roleRemoteUpgrade from 'roles/remote-upgrade'
import roleRemoteBuild from 'roles/remote-build'
import {
    PREFERENCE_WORKER,
    TASK_BUILDING,
    TASK_HAULING,
    TASK_UPGRADING,
} from 'roles/logistics-constants'
import roleHarvester from 'roles/harvester'
import EnergyManager from 'managers/energy-manager'
import { RoomManager } from 'managers/room-manager'
import SourceManager from 'managers/source-manager'
import SourcesManager from 'managers/sources-manager'
import { getCreeps, getLogisticsCreeps } from 'utils/creep'

const HARVESTERS_PER_SOURCE = 1
const UPGRADERS_COUNT = 1
const BUILDERS_COUNT = 1
const MASON_COUNT = 1
const RESCUE_WORKER_COUNT = 3

const CLAIMERS_COUNT = 3
const ATTACKERS_COUNT = 2
const REMOTE_UPGRADE_COUNT = 1
const REMOTE_BUILD_COUNT = 2

export default function (spawn: StructureSpawn) {
    updateRescueStatus(spawn.room)

    if (spawn.room.memory.collapsed) {
        createRescueCreeps(spawn)
        return
    }
    const room = spawn.room
    const roomMemory = room.memory
    const masons = getCreeps('mason', room)
    const energyManager = EnergyManager.get(spawn.room)
    const roomManager = new RoomManager(room);
    const sourcesManager = new SourcesManager(room)
    const warDepartment = new WarDepartment(spawn.room)
    const haulers = getLogisticsCreeps(TASK_HAULING, room)
    const upgraders = getLogisticsCreeps(TASK_UPGRADING, room)
    const builders = getLogisticsCreeps(TASK_BUILDING, room)
    const workers = getLogisticsCreeps(PREFERENCE_WORKER, room)

    if (!sourcesManager.hasEnoughHarvesters()) {
        sourcesManager.createHarvester(spawn)
        return
    }

    if (warDepartment.status !== WarStatus.NONE) {
        createWarCreeps(spawn, warDepartment)
        return
    }

    const request = RoleLogistics.requestedCarryCapacity(spawn)
    if (room.energyAvailable < 0.95 * spawn.room.energyCapacityAvailable) {
        return
    }

    if (RoleLogistics.shouldCreateCreep(spawn)) {
        if (haulers.length < 1) {
            RoleLogistics.createCreep(spawn, TASK_HAULING)
            return
        } else if (workers.length < 1) {
            RoleLogistics.createCreep(spawn, PREFERENCE_WORKER)
            return
        } else if (upgraders.length < UPGRADERS_COUNT) {
            RoleLogistics.createCreep(spawn, TASK_UPGRADING)
            return
        } else if (builders.length < BUILDERS_COUNT) {
            RoleLogistics.createCreep(spawn, TASK_BUILDING)
            return
        }
    }

    if (roomManager.claimRoom()) {
        return
    }

    if (masons.length < MASON_COUNT && MasonCreep.shouldCreate(room)) {
        roleMason.create(spawn)
        return
    } else if (RoleLogistics.shouldCreateCreep(spawn)) {
        RoleLogistics.createCreep(spawn, PREFERENCE_WORKER)
        return
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
    }

    if (warDepartment.hasHostiles()) {
        return;
    }

    if (status === WarStatus.CLAIM && claimers.length < CLAIMERS_COUNT) {
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
    const sourceManager = SourceManager.createFromSourceId(harvesterSource)
    const harvesters = getCreeps('harvester', room)
    const workers = getLogisticsCreeps(PREFERENCE_WORKER, room)

    if (workers.length < RESCUE_WORKER_COUNT) {
        RoleLogistics.createCreep(spawn, PREFERENCE_WORKER, true)
    } else if (harvesters.length < sourceCount) {
        roleHarvester.create(spawn, sourceManager.containerPosition, harvesterSource, true)
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
