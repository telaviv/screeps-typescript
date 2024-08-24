import { exponential, polynomial, logarithmic, DataPoint, Result } from 'regression'

import * as Logger from 'utils/logger'
import { PREFERENCE_WORKER, TASK_BUILDING, TASK_UPGRADING } from 'roles/logistics-constants'
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
import { getTotalDroppedResources } from 'tasks/pickup'
import { getVirtualStorage } from 'utils/virtual-storage'
import { isTravelTask } from 'tasks/travel/utils'
import roleAttacker from 'roles/attacker'
import roleClaimer from 'roles/claim'
import roleEnergyHauler from 'roles/energy-hauler'
import roleRebalancer from 'roles/rebalancer'
import roleScout from 'roles/scout'
import roleStaticLinkHauler from 'roles/static-link-hauler'
import roleStaticUpgrader from 'roles/static-upgrader'
import { wrap } from 'utils/profiling'

declare global {
    interface RoomMemory {
        lastLatentWorker?: number
    }
}

const UPGRADERS_COUNT = 1
const BUILDERS_COUNT = 1
const MASON_COUNT = 1
const RESCUE_WORKER_COUNT = 3
const ATTACKERS_COUNT = 2

const MAX_USEFUL_ENERGY = 1800
const MAX_DROPPED_RESOURCES = 1000

function getLatentWorkerInterval(room: Room): number {
    if (room.energyCapacityAvailable < 550) {
        return 50
    }
    return 100
}
const ENERGY_DATA: DataPoint[] = [
    [300, 0.25],
    [800, 0.35],
    [1300, 0.5],
    [1800, 2.0],
    [2300, 2.75],
]
const REGRESSION_PRECISION = 12
const regressions: [string, Result][] = [
    ['quadratic', polynomial(ENERGY_DATA, { precision: REGRESSION_PRECISION, order: 2 })],
    ['logarithmic', logarithmic(ENERGY_DATA, { precision: REGRESSION_PRECISION })],
    ['exponential', exponential(ENERGY_DATA, { precision: REGRESSION_PRECISION })],
]
regressions.sort((a, b) => b[1].r2 - a[1].r2)
for (const [name, result] of regressions) {
    Logger.warning(`rcl-2:minAvailableEnergy:${name}`, result.string, `[r2: ${result.r2}]`)
}
function minAvailableEnergy(room: Room): number {
    return regressions[0][1].predict(room.energyCapacityAvailable)[1]
}

const isEnergyRestricted = wrap((room: Room): boolean => {
    const minEnergy = minAvailableEnergy(room)
    return (
        getSlidingEnergy(room.memory, 99) < minEnergy ||
        getSlidingEnergy(room.memory, 999) < minEnergy
    )
}, 'rcl-2:isEnergyRestricted')

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

    if (defenseDepartment.needsDefenders()) {
        defenseDepartment.createDefender(spawn, room.energyAvailable)
        return
    }

    if (defenseDepartment.needsHealer()) {
        defenseDepartment.createHealer(spawn)
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
    const droppedResources = getTotalDroppedResources(room)
    const constructionSites = getConstructionSites(room).filter(
        (site) => site.structureType !== STRUCTURE_RAMPART,
    )
    const masons = getCreeps('mason', room)
    const roomManager = new RoomManager(room)
    const sourcesManager = new SourcesManager(room)
    const upgraders = getLogisticsCreeps({ preference: TASK_UPGRADING, room })
    const builders = getLogisticsCreeps({ preference: TASK_BUILDING, room })
    const workers = getLogisticsCreeps({ room }).filter(
        (creep) => creep.getActiveBodyparts(WORK) > 0,
    )
    const rebalancers = getCreeps('rebalancer', room)
    const haulers = getCreeps('energy-hauler', room)
    const virtualStorage = getVirtualStorage(room.name)

    if (RoleLogistics.shouldCreateCreep(spawn)) {
        if (haulers.length < 1) {
            roleEnergyHauler.create(spawn)
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
        } else if (rebalancers.length < 1 && virtualStorage) {
            roleRebalancer.create(spawn)
            return
        } else if (
            rebalancers.length < 2 &&
            virtualStorage &&
            droppedResources > MAX_DROPPED_RESOURCES
        ) {
            roleRebalancer.create(spawn)
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
    }
    createLatentWorkers(spawn)
}

function linkStrategy(spawn: StructureSpawn): void {
    const room = spawn.room
    const constructionSites = getConstructionSites(room)
    const roomManager = new RoomManager(room)
    const sourcesManager = new SourcesManager(room)
    const links = getLinks(room)
    const masons = getCreeps('mason', room)
    const staticLinkHaulers = getCreeps('static-link-hauler', room)
    const staticUpgraders = getCreeps('static-upgrader', room)
    const upgraders = getLogisticsCreeps({ preference: TASK_UPGRADING, room })
    const builders = getLogisticsCreeps({ preference: TASK_BUILDING, room })
    const upgraderCount = upgraders.length + staticUpgraders.length
    const rebalancers = getCreeps('rebalancer', room)
    const haulers = getCreeps('energy-hauler', room)
    const virtualStorage = getVirtualStorage(room.name)

    if (RoleLogistics.shouldCreateCreep(spawn)) {
        if (haulers.length < 1) {
            roleEnergyHauler.create(spawn)
            return
        }
        if (upgraderCount === 0 && !LinkManager.hasControllerLink(room)) {
            RoleLogistics.createCreep(spawn, TASK_UPGRADING)
            return
        } else if (builders.length < BUILDERS_COUNT && constructionSites.length > 0) {
            RoleLogistics.createCreep(spawn, TASK_BUILDING)
            return
        } else if (rebalancers.length < 1 && virtualStorage && links.length < 3) {
            roleRebalancer.create(spawn)
            return
        } else if (haulers.length < 2 && !isEnergyRestricted(room) && rebalancers.length === 0) {
            roleEnergyHauler.create(spawn)
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
    createLatentWorkers(spawn)
}

function createLatentWorkers(spawn: StructureSpawn): void {
    const room = spawn.room
    if (RoleLogistics.shouldCreateCreep(spawn)) {
        if (isEnergyRestricted(room)) {
            Logger.debug(
                'rcl-2:create-latent-workers:lowEnergy',
                isEnergyRestricted(room),
                spawn.room.name,
            )
            return
        }
        let cerr: ScreepsReturnCode | null = null
        if (Game.time - (room.memory.lastLatentWorker ?? 0) >= getLatentWorkerInterval(room)) {
            cerr = RoleLogistics.createCreep(spawn, PREFERENCE_WORKER)
        } else {
            Logger.info(
                'rcl-2:create-latent-workers:too-soon',
                spawn.room.name,
                (room.memory.lastLatentWorker ?? 0) + getLatentWorkerInterval(room) - Game.time,
            )
        }
        if (cerr === OK) {
            room.memory.lastLatentWorker = Game.time
        }
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

    if (warDepartment.hasSafeMode() || warDepartment.hasOverwhelmingForce()) {
        return null
    }

    if (warDepartment.targetRoom === undefined) {
        if (scouts.length === 0) {
            return roleScout.create(spawn, warDepartment.target, true)
        }
        return null
    }

    const remoteWorkers = getLogisticsCreeps({ room: warDepartment.targetRoom })

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
        if (remoteWorkers.length === 0) {
            RoleLogistics.createCreep(spawn, PREFERENCE_WORKER, {
                home: warDepartment.target,
            })
        } else if (isEnergyRestricted(room)) {
            if (remoteWorkers.length < 2) {
                return RoleLogistics.createCreep(spawn, PREFERENCE_WORKER, {
                    home: warDepartment.target,
                })
            } else if (!sourcesManager.hasAllContainerHarvesters()) {
                return sourcesManager.createHarvester(spawn, true)
            } else {
                return RoleLogistics.createCreep(spawn, PREFERENCE_WORKER, {
                    home: warDepartment.target,
                })
            }
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
    const workers = getLogisticsCreeps({ room }).filter(
        (creep) => creep.getActiveBodyparts(WORK) > 0,
    )
    const defenseDepartment = new DefenseDepartment(spawn.room)

    if (defenseDepartment.needsDefenders()) {
        defenseDepartment.createDefender(spawn, room.energyAvailable)
    } else if (workers.length < RESCUE_WORKER_COUNT) {
        RoleLogistics.createCreep(spawn, PREFERENCE_WORKER, { rescue: true })
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
