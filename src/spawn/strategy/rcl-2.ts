import WarDepartment, { WarStatus } from 'war-department'
import roleClaimer from 'roles/claim'
import roleAttacker from 'roles/attacker'
import RoleLogistics from 'roles/logistics'
import roleMason, { MasonCreep } from 'roles/mason'
import roleRemoteUpgrade from 'roles/remote-upgrade'
import roleRemoteBuild from 'roles/remote-build'
import roleWrecker from 'roles/wrecker'
import {
    PREFERENCE_WORKER,
    TASK_BUILDING,
    TASK_HAULING,
    TASK_UPGRADING,
} from 'roles/logistics-constants'
import roleHarvester from 'roles/harvester'
import EnergyManager from 'managers/energy-manager'
import { RoomManager } from 'managers/room-manager'
import SourcesManager from 'managers/sources-manager'
import { getCreeps, getLogisticsCreeps } from 'utils/creep'
import roleScout from 'roles/scout'

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
    const masons = getCreeps('mason', room)
    const roomManager = new RoomManager(room);
    const sourcesManager = new SourcesManager(room)
    const warDepartment = new WarDepartment(spawn.room)
    const haulers = getLogisticsCreeps({ preference: TASK_HAULING, room })
    const upgraders = getLogisticsCreeps({ preference: TASK_UPGRADING, room })
    const builders = getLogisticsCreeps({ preference: TASK_BUILDING, room })
    const workers = getLogisticsCreeps({ preference: PREFERENCE_WORKER, room })

    if (!sourcesManager.hasAllContainerHarvesters()) {
        sourcesManager.createHarvester(spawn)
        return
    }

    if (room.energyAvailable < 0.95 * spawn.room.energyCapacityAvailable) {
        return
    }

    if (warDepartment.status !== WarStatus.NONE) {
        const err = createWarCreeps(spawn, warDepartment)
        if (err === OK) {
            return
        }
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

    if (roomManager.canClaimRoom()) {
        roomManager.claimRoom()
        return
    }

    if (!sourcesManager.hasEnoughHarvesters()) {
        sourcesManager.createHarvester(spawn)
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

function createWarCreeps(spawn: StructureSpawn, warDepartment: WarDepartment): number | null {
    const room = spawn.room
    const status = warDepartment.status
    const attackers = getCreeps('attack', room)
    const claimers = getCreeps('claimer', room)
    const scouts = getCreeps('scout', room)
    const remoteUpgraders = getCreeps('remote-upgrade', room)
    const remoteBuilders = getCreeps('remote-build', room)

    if (warDepartment.targetRoom === undefined && scouts.length === 0) {
        if (scouts.length === 0) {
            return roleScout.create(spawn, warDepartment.target)
        }
        return null
    }

    if (status === WarStatus.ATTACK && attackers.length < ATTACKERS_COUNT) {
        return roleAttacker.create(spawn, warDepartment.target)
    }

    if (warDepartment.hasHostiles()) {
        return null
    }

    if ([WarStatus.CLAIM, WarStatus.MINIMAL_CLAIM].includes(status)) {
        if (warDepartment.hasInvaderCore()) {
            return roleAttacker.create(spawn, warDepartment.target)
        } else if (claimers.length < CLAIMERS_COUNT) {
            if (warDepartment.targetRoom!.controller!.upgradeBlocked < 20) {
                return roleClaimer.create(spawn, warDepartment.target)
            }
        }
    } else if (status === WarStatus.SPAWN) {
        if (remoteUpgraders.length < REMOTE_UPGRADE_COUNT) {
            return roleRemoteUpgrade.create(spawn, warDepartment.target)
        } else if (remoteBuilders.length < REMOTE_BUILD_COUNT) {
            return roleRemoteBuild.create(spawn, warDepartment.target)
        }
    }
    return null
}

function createRescueCreeps(spawn: StructureSpawn) {
    const room = spawn.room
    const roomMemory = room.memory
    const sourceCount = Object.keys(roomMemory.stationaryPoints.sources).length
    const energyManager = EnergyManager.get(spawn.room)
    const sourceId = energyManager.forceSourceAssignment('harvester')
    const harvesters = getCreeps('harvester', room)
    const workers = getLogisticsCreeps({ preference: PREFERENCE_WORKER, room })

    if (workers.length < RESCUE_WORKER_COUNT) {
        RoleLogistics.createCreep(spawn, PREFERENCE_WORKER, true)
    } else if (harvesters.length < sourceCount) {
        roleHarvester.create(spawn, sourceId, true)
    }
}

function updateRescueStatus(room: Room) {
    const roomMemory = room.memory
    const sourceCount = Object.keys(roomMemory.stationaryPoints.sources).length
    const haulers = getLogisticsCreeps({ preference: TASK_HAULING, room })
    const workers = getLogisticsCreeps({ preference: PREFERENCE_WORKER, room })
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
