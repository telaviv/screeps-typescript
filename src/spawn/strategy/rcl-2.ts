import * as Logger from 'utils/logger'
import {
    PREFERENCE_WORKER,
    TASK_BUILDING,
    TASK_HAULING,
    TASK_UPGRADING,
} from 'roles/logistics-constants'
import WarDepartment, { WarStatus } from 'war-department'
import { getConstructionSites, getLinks, hasWeakWall } from 'utils/room'
import { getCreeps, getLogisticsCreeps } from 'utils/creep'
import roleMason, { MasonCreep } from 'roles/mason'
import DefenseDepartment from 'defense-department'
import LinkManager from 'managers/link-manager'
import RoleLogistics from 'roles/logistics'
import { RoomManager } from 'managers/room-manager'
import SourcesManager from 'managers/sources-manager'
import { getStationaryPoints } from 'surveyor'
import roleAttacker from 'roles/attacker'
import roleClaimer from 'roles/claim'
import roleRemoteBuild from 'roles/remote-build'
import roleRemoteUpgrade from 'roles/remote-upgrade'
import roleScout from 'roles/scout'
import roleStaticLinkHauler from 'roles/static-link-hauler'
import roleStaticUpgrader from 'roles/static-upgrader'

const UPGRADERS_COUNT = 1
const BUILDERS_COUNT = 1
const MASON_COUNT = 1
const RESCUE_WORKER_COUNT = 3

const CLAIMERS_COUNT = 1
const ATTACKERS_COUNT = 2
const REMOTE_UPGRADE_COUNT = 1
const REMOTE_BUILD_MINIMUM = 1

const MAX_USEFUL_ENERGY = 1200 // roughly the biggest logistics bot

export default function runStrategy(spawn: StructureSpawn): void {
    updateRescueStatus(spawn.room)
    if (spawn.spawning) {
        return
    }

    if (spawn.room.memory.collapsed) {
        createRescueCreeps(spawn)
        return
    }
    const room = spawn.room
    const links = getLinks(room)
    const masons = getCreeps('mason', room)
    const roomManager = new RoomManager(room)
    const sourcesManager = new SourcesManager(room)
    const warDepartment = new WarDepartment(spawn.room)
    const defenseDepartment = new DefenseDepartment(spawn.room)

    if (roomManager.getScoutRoomTasks().length > 0) {
        roomManager.scoutRoom()
        return
    }

    if (
        room.energyAvailable <
        Math.min(0.95 * spawn.room.energyCapacityAvailable, MAX_USEFUL_ENERGY)
    ) {
        return
    }

    if (!sourcesManager.hasAllContainerHarvesters()) {
        sourcesManager.createHarvester(spawn)
        return
    }

    if (hasWeakWall(room) && masons.length < MASON_COUNT) {
        roleMason.create(spawn)
        return
    }

    if (defenseDepartment.needsDefenders()) {
        defenseDepartment.createDefender(spawn, room.energyAvailable)
        return
    }

    if (defenseDepartment.needsHealer()) {
        defenseDepartment.createHealer(spawn)
    }

    if (warDepartment.status !== WarStatus.NONE) {
        const err = createWarCreeps(spawn, warDepartment)
        if (err === OK) {
            return
        }
    }

    if (links.length >= 2) {
        linkStrategy(spawn)
    } else {
        swarmStrategy(spawn)
    }
}

function swarmStrategy(spawn: StructureSpawn): void {
    const room = spawn.room
    const constructionSites = getConstructionSites(room)
    const masons = getCreeps('mason', room)
    const roomManager = new RoomManager(room)
    const sourcesManager = new SourcesManager(room)
    const haulers = getLogisticsCreeps({ preference: TASK_HAULING, room })
    const upgraders = getLogisticsCreeps({ preference: TASK_UPGRADING, room })
    const builders = getLogisticsCreeps({ preference: TASK_BUILDING, room })
    const workers = getLogisticsCreeps({ preference: PREFERENCE_WORKER, room })

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
        } else if (builders.length < BUILDERS_COUNT && constructionSites.length > 0) {
            RoleLogistics.createCreep(spawn, TASK_BUILDING)
            return
        }
    }

    if (roomManager.canClaimRoom()) {
        roomManager.claimRoom()
        return
    }

    if (roomManager.getScoutRoomTasks().length > 0) {
        roomManager.scoutRoom()
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

function linkStrategy(spawn: StructureSpawn): void {
    const room = spawn.room
    const constructionSites = getConstructionSites(room)
    const roomManager = new RoomManager(room)
    const sourcesManager = new SourcesManager(room)
    const masons = getCreeps('mason', room)
    const staticLinkHaulers = getCreeps('static-link-hauler', room)
    const staticUpgraders = getCreeps('static-upgrader', room)
    const haulers = getLogisticsCreeps({ preference: TASK_HAULING, room })
    const upgraders = getLogisticsCreeps({ preference: TASK_UPGRADING, room })
    const builders = getLogisticsCreeps({ preference: TASK_BUILDING, room })
    const workers = getLogisticsCreeps({ preference: PREFERENCE_WORKER, room })
    const upgraderCount = upgraders.length + staticUpgraders.length

    if (RoleLogistics.shouldCreateCreep(spawn)) {
        if (haulers.length < 1) {
            RoleLogistics.createCreep(spawn, TASK_HAULING)
            return
        } else if (workers.length === 0) {
            RoleLogistics.createCreep(spawn, PREFERENCE_WORKER)
            return
        } else if (upgraderCount === 0 && !LinkManager.hasControllerLink(room)) {
            RoleLogistics.createCreep(spawn, TASK_UPGRADING)
            return
        } else if (builders.length < BUILDERS_COUNT && constructionSites.length > 0) {
            RoleLogistics.createCreep(spawn, TASK_BUILDING)
            return
        }
    }

    if (roomManager.canClaimRoom()) {
        roomManager.claimRoom()
        return
    }

    if (roomManager.getScoutRoomTasks().length > 0) {
        roomManager.scoutRoom()
        return
    }

    if (
        staticLinkHaulers.length === 0 &&
        roleStaticLinkHauler.canCreate(spawn, room.energyAvailable)
    ) {
        roleStaticLinkHauler.create(spawn, room.name, room.energyAvailable)
        return
    }

    if (staticUpgraders.length === 0 && roleStaticUpgrader.canCreate(spawn, room.energyAvailable)) {
        roleStaticUpgrader.create(spawn, room.name, room.energyAvailable)
        return
    }

    if (!sourcesManager.hasEnoughHarvesters()) {
        sourcesManager.createHarvester(spawn)
        return
    }

    if (masons.length < MASON_COUNT && MasonCreep.shouldCreate(room)) {
        roleMason.create(spawn)
        return
    }
}

function createWarCreeps(spawn: StructureSpawn, warDepartment: WarDepartment): number | null {
    const room = spawn.room
    const status = warDepartment.status
    const capacity = Math.min(MAX_USEFUL_ENERGY, room.energyAvailable)
    const attackers = getCreeps('attack', room)
    const claimers = getCreeps('claimer', room)
    const scouts = getCreeps('scout', room)
    const remoteUpgraders = getCreeps('remote-upgrade', room)
    const remoteBuilders = getCreeps('remote-build', room)

    if (warDepartment.targetRoom === undefined) {
        if (scouts.length === 0) {
            return roleScout.create(spawn, warDepartment.target, true)
        }
        return null
    }

    const sourcesManager = SourcesManager.create(warDepartment.targetRoom)
    if (!sourcesManager) {
        return null
    }

    if (
        (status === WarStatus.ATTACK || warDepartment.hasHostiles()) &&
        attackers.length < ATTACKERS_COUNT
    ) {
        return roleAttacker.create(spawn, warDepartment.target, capacity)
    }

    if (status === WarStatus.CLAIM) {
        if (warDepartment.hasInvaderCore() && attackers.length < ATTACKERS_COUNT) {
            return roleAttacker.create(spawn, warDepartment.target, capacity)
        } else if (claimers.length < CLAIMERS_COUNT) {
            if (claimers.length === 0) {
                return roleClaimer.create(spawn, warDepartment.target)
            } else if (
                warDepartment.targetRoom.controller &&
                (warDepartment.targetRoom.controller.upgradeBlocked < 100 ||
                    warDepartment.targetRoom.controller.reservation)
            ) {
                return roleClaimer.create(spawn, warDepartment.target)
            }
        }
    } else if (status === WarStatus.SPAWN) {
        if (remoteUpgraders.length < REMOTE_UPGRADE_COUNT) {
            return roleRemoteUpgrade.create(spawn, warDepartment.target, capacity)
        } else if (!sourcesManager.hasAHarvester()) {
            return sourcesManager.createHarvester(spawn, true)
        } else if (remoteBuilders.length < REMOTE_BUILD_MINIMUM) {
            return roleRemoteBuild.create(spawn, warDepartment.target, capacity)
        } else if (!sourcesManager.hasAllContainerHarvesters()) {
            return sourcesManager.createHarvester(spawn, true)
        } else {
            return roleRemoteBuild.create(spawn, warDepartment.target, capacity)
        }
    }
    return null
}

function createRescueCreeps(spawn: StructureSpawn) {
    const room = spawn.room
    const stationaryPoints = getStationaryPoints(room)
    if (!stationaryPoints) {
        Logger.error('createRescueCreeps:missing-stationary-points', room.name)
        return
    }
    const sourcesManager = new SourcesManager(room)
    const sourceCount = Object.keys(stationaryPoints.sources).length
    const harvesters = getCreeps('harvester', room)
    const workers = getLogisticsCreeps({ preference: PREFERENCE_WORKER, room })

    if (workers.length < RESCUE_WORKER_COUNT) {
        RoleLogistics.createCreep(spawn, PREFERENCE_WORKER, true)
    } else if (harvesters.length < sourceCount) {
        sourcesManager.createHarvester(spawn, true)
    }
}

function updateRescueStatus(room: Room) {
    const stationaryPoints = getStationaryPoints(room)
    if (!stationaryPoints) {
        Logger.error('updateRescueStatus:missing-stationary-points', room.name)
        return
    }
    const sourceCount = Object.keys(stationaryPoints.sources).length
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
