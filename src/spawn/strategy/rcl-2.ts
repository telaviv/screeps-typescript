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
import { getSlidingEnergy } from 'room-window'
import { getStationaryPoints } from 'construction-features'
import { isTravelTask } from 'tasks/travel/utils'
import roleAttacker from 'roles/attacker'
import roleClaimer from 'roles/claim'
import roleRemoteWorker from 'roles/remote-worker'
import roleScout from 'roles/scout'
import roleStaticLinkHauler from 'roles/static-link-hauler'
import roleStaticUpgrader from 'roles/static-upgrader'

const UPGRADERS_COUNT = 1
const BUILDERS_COUNT = 1
const MASON_COUNT = 1
const RESCUE_WORKER_COUNT = 3
const ATTACKERS_COUNT = 2

const MAX_USEFUL_ENERGY = 1200 // roughly the biggest logistics bot
const MIN_AVAILABLE_ENERGY = 0.11 // % of 2 containers

function isEnergyRestricted(room: Room): boolean {
    return (
        getSlidingEnergy(room.memory, 99) < MIN_AVAILABLE_ENERGY ||
        getSlidingEnergy(room.memory, 999) < MIN_AVAILABLE_ENERGY
    )
}

export default function runStrategy(spawn: StructureSpawn): void {
    updateRescueStatus(spawn.room)
    if (spawn.spawning) {
        return
    }

    if (spawn.room.memory.collapsed) {
        Logger.error('rescue creeps: collapsed', spawn.room.name)
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

    if (defenseDepartment.needsDefenders()) {
        defenseDepartment.createDefender(spawn, room.energyAvailable)
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
    const constructionSites = getConstructionSites(room).filter(
        (site) => site.structureType !== STRUCTURE_RAMPART,
    )
    const masons = getCreeps('mason', room)
    const roomManager = new RoomManager(room)
    const sourcesManager = new SourcesManager(room)
    const haulers = getLogisticsCreeps({ preference: TASK_HAULING, room })
    const upgraders = getLogisticsCreeps({ preference: TASK_UPGRADING, room })
    const builders = getLogisticsCreeps({ preference: TASK_BUILDING, room })
    const workers = getLogisticsCreeps({ room }).filter(
        (creep) => creep.getActiveBodyparts(WORK) > 0,
    )

    if (RoleLogistics.shouldCreateCreep(spawn)) {
        if (haulers.length < 1) {
            RoleLogistics.createCreep(spawn, TASK_HAULING)
            return
        } else if (workers.length < 2) {
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
        if (isEnergyRestricted(room)) {
            Logger.debug(
                'rcl-2:create-latent-workers:lowEnergy',
                getSlidingEnergy(spawn.room.memory, 99),
                getSlidingEnergy(spawn.room.memory, 999),
                spawn.room.name,
            )
            return
        }
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
    const workers = getLogisticsCreeps({ room }).filter(
        (creep) => creep.getActiveBodyparts(WORK) > 0,
    )
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
    const scouts = getCreeps('scout', room).filter(
        (creep) =>
            creep.memory.tasks.length > 0 &&
            isTravelTask(creep.memory.tasks[0]) &&
            creep.memory.tasks[0].destination === warDepartment.target &&
            creep.memory.tasks[0].permanent,
    )
    const remoteWorker = getCreeps('remote-worker', room)

    if (warDepartment.hasSafeMode() || warDepartment.hasOverwhelmingForce()) {
        return null
    }

    if (warDepartment.targetRoom === undefined) {
        if (scouts.length === 0) {
            return roleScout.create(spawn, warDepartment.target, true)
        }
        return null
    }

    if (
        (status === WarStatus.ATTACK || warDepartment.needsProtection) &&
        attackers.length < ATTACKERS_COUNT
    ) {
        return roleAttacker.create(spawn, warDepartment.target, capacity)
    }

    if (status === WarStatus.ATTACK) {
        if (warDepartment.hasHostileController()) {
            if (claimers.length === 0) {
                return roleClaimer.create(spawn, warDepartment.target, { attack: true })
            } else if (
                warDepartment.claimerSpotsAvailable() > claimers.length &&
                isEnergyRestricted(room)
            ) {
                return roleClaimer.create(spawn, warDepartment.target, { attack: true })
            }
        }
    }

    const sourcesManager = SourcesManager.create(warDepartment.targetRoom)
    if (!sourcesManager) {
        return null
    }

    if (status === WarStatus.CLAIM) {
        if (warDepartment.hasStrongInvaderCore() && warDepartment.claimerSpotsAvailable() <= 1) {
            return null
        } else if (claimers.length === 0) {
            return roleClaimer.create(spawn, warDepartment.target, {
                minimal: warDepartment.canMinimallyClaim(),
            })
        } else if (
            warDepartment.claimerSpotsAvailable() > claimers.length &&
            !warDepartment.canMinimallyClaim()
        ) {
            return roleClaimer.create(spawn, warDepartment.target)
        }
    } else if (status === WarStatus.SPAWN) {
        if (!sourcesManager.hasAHarvester()) {
            return sourcesManager.createHarvester(spawn, true)
        } else if (remoteWorker.length === 0) {
            return roleRemoteWorker.create(spawn, warDepartment.target, capacity)
        } else if (isEnergyRestricted(room)) {
            if (remoteWorker.length < 2) {
                return roleRemoteWorker.create(spawn, warDepartment.target, capacity)
            } else if (!sourcesManager.hasAllContainerHarvesters()) {
                return sourcesManager.createHarvester(spawn, true)
            } else {
                return roleRemoteWorker.create(spawn, warDepartment.target, capacity)
            }
        }
    }
    return null
}

function createRescueCreeps(spawn: StructureSpawn) {
    Logger.error('createRescueCreeps:collapsed', spawn.room.name)
    const room = spawn.room
    const stationaryPoints = getStationaryPoints(room)
    if (!stationaryPoints) {
        Logger.error('createRescueCreeps:missing-stationary-points', room.name)
        return
    }
    const sourcesManager = new SourcesManager(room)
    const sourceCount = Object.keys(stationaryPoints.sources).length
    const harvesters = getCreeps('harvester', room)
    const workers = getLogisticsCreeps({ room }).filter(
        (creep) => creep.getActiveBodyparts(WORK) > 0,
    )
    const defenseDepartment = new DefenseDepartment(spawn.room)

    if (defenseDepartment.needsDefenders()) {
        defenseDepartment.createDefender(spawn, room.energyAvailable)
    } else if (workers.length < RESCUE_WORKER_COUNT) {
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
    const rescueCount = getLogisticsCreeps({ room }).filter(
        (creep) => creep.getActiveBodyparts(CARRY) > 0 && creep.getActiveBodyparts(WORK) > 0,
    ).length
    const harvesters = getCreeps('harvester', room)
    if (
        room.memory.collapsed &&
        rescueCount >= RESCUE_WORKER_COUNT &&
        harvesters.length >= sourceCount
    ) {
        room.memory.collapsed = false
    } else if (!room.memory.collapsed && rescueCount < sourceCount) {
        room.memory.collapsed = true
    }
}
