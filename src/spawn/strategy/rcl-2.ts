import { exponential, polynomial, logarithmic, DataPoint, Result } from 'regression'

import * as Logger from 'utils/logger'
import { PREFERENCE_WORKER, TASK_BUILDING, TASK_UPGRADING } from 'roles/logistics-constants'
import WarDepartment, { WarStatus } from 'war-department'
import { getCreeps, getLogisticsCreeps } from 'utils/creep'
import roleEnergyHauler, { EnergyHauler } from 'roles/energy-hauler'
import roleMason, { MasonCreep } from 'roles/mason'
import DefenseDepartment from 'defense-department'
import RoleLogistics from 'roles/logistics'
import { RoomManager } from 'managers/room-manager'
import RoomQuery from 'spawn/room-query'
import SourcesManager from 'managers/sources-manager'
import { getConstructionSites } from 'utils/room'
import { getSlidingEnergy } from 'room-window'
import { getStationaryPoints } from 'construction-features'
import { getVirtualStorage } from 'utils/virtual-storage'
import hash from 'utils/hash'
import { isTravelTask } from 'tasks/travel/utils'
import roleAttacker from 'roles/attacker'
import roleClaimer from 'roles/claim'
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

const MIN_USEFUL_LINK_ENERGY = BODYPART_COST[CARRY] * 9 + BODYPART_COST[MOVE]
const MAX_USEFUL_ENERGY =
    BODYPART_COST[CARRY] * 12 + BODYPART_COST[WORK] * 12 + BODYPART_COST[MOVE] * 24
const MAX_DROPPED_RESOURCES = 1000
const LATENT_WORKER_INTERVAL_MULTIPLIER = 200
const SPAWN_CHECK_MOD = 4

function getLatentWorkerInterval(room: Room): number {
    return Math.floor(minAvailableEnergy(room) * LATENT_WORKER_INTERVAL_MULTIPLIER)
}
const ENERGY_DATA: DataPoint[] = [
    [300, 0.3],
    [800, 0.325],
    [1300, 0.5],
    [1800, 2.25],
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

export default wrap((spawn: StructureSpawn): void => {
    updateRescueStatus(spawn.room)
    if (spawn.spawning) {
        return
    }

    if (spawn.room.memory.collapsed) {
        createRescueCreeps(spawn)
        return
    }

    if ((hash(spawn.id) + Game.time) % SPAWN_CHECK_MOD !== 0) {
        return
    }

    const room = spawn.room
    const roomManager = new RoomManager(room)
    const warDepartment = new WarDepartment(spawn.room)
    const defenseDepartment = new DefenseDepartment(spawn.room)
    const isFullOfEnergy =
        Math.min(0.95 * room.energyCapacityAvailable, MAX_USEFUL_ENERGY) * 0.95 <=
        room.energyAvailable
    const capacity = isEnergyRestricted(room)
        ? Math.min(MAX_USEFUL_ENERGY, room.energyCapacityAvailable)
        : room.energyCapacityAvailable
    const roomQuery = new RoomQuery(room)

    if (roomManager.getScoutRoomTasks().length > 0) {
        roomManager.scoutRoom()
        return
    }

    if (room.energyAvailable < 300) {
        return
    }

    if (defenseDepartment.needsDefenders()) {
        defenseDepartment.createDefender(spawn, capacity)
        return
    }

    if (defenseDepartment.needsHealer()) {
        defenseDepartment.createHealer(spawn)
        return
    }

    if (warDepartment.status !== WarStatus.NONE && isFullOfEnergy) {
        const err = createWarCreeps(spawn, warDepartment)
        if (err === OK) {
            return
        }
    }

    if (roomQuery.linkCount() >= 2) {
        linkStrategy(spawn)
    } else {
        swarmStrategy(spawn)
    }
}, 'rcl-2:run-strategy')

const swarmStrategy = wrap((spawn: StructureSpawn): void => {
    const minEnergy = Math.min(0.95 * spawn.room.energyCapacityAvailable, MAX_USEFUL_ENERGY)
    if (spawn.room.energyAvailable < minEnergy) {
        return
    }

    const room = spawn.room
    const capacity = isEnergyRestricted(room)
        ? Math.min(MAX_USEFUL_ENERGY, room.energyCapacityAvailable)
        : room.energyCapacityAvailable
    const constructionSites = getConstructionSites(room).filter(
        (site) => site.structureType !== STRUCTURE_RAMPART,
    )
    const haulers = getCreeps('energy-hauler', room)
    const roomManager = new RoomManager(room)
    const sourcesManager = new SourcesManager(room)
    const virtualStorage = getVirtualStorage(room.name)
    const roomQuery = new RoomQuery(room)

    if (!sourcesManager.hasAllContainerHarvesters()) {
        sourcesManager.createHarvester(spawn, { roadsBuilt: roomQuery.allRoadsBuilt(), capacity })
        return
    }
    if (roomQuery.getCreepCount('energy-hauler') > 0) {
        for (const hauler of haulers as EnergyHauler[]) {
            if (
                roleEnergyHauler.shouldCancelAutoRenew(hauler, capacity, roomQuery.allRoadsBuilt())
            ) {
                roleEnergyHauler.cancelAutoRenew(hauler)
            }
        }
    }

    if (RoleLogistics.shouldCreateCreep(spawn, capacity)) {
        if (roomQuery.getCreepCount('energy-hauler') < 1) {
            roleEnergyHauler.create(spawn, capacity, roomQuery.allRoadsBuilt())
            return
        } else if (roomQuery.getLogisticsCreepCount({ preference: PREFERENCE_WORKER }) < 1) {
            RoleLogistics.createCreep(spawn, PREFERENCE_WORKER, { capacity })
            return
        } else if (
            roomQuery.getLogisticsCreepCount({ preference: TASK_UPGRADING }) < UPGRADERS_COUNT
        ) {
            RoleLogistics.createCreep(spawn, TASK_UPGRADING, { capacity })
            return
        } else if (
            roomQuery.getLogisticsCreepCount({ preference: TASK_BUILDING }) < BUILDERS_COUNT &&
            constructionSites.length > 0
        ) {
            RoleLogistics.createCreep(spawn, TASK_BUILDING, { capacity })
            return
        } else if (roomQuery.getCreepCount('rebalancer') < 1 && virtualStorage) {
            roleRebalancer.create(spawn, capacity)
            return
        } else if (
            roomQuery.getCreepCount('rebalancer') < 2 &&
            roomQuery.getDroppedResourceCount() > MAX_DROPPED_RESOURCES &&
            virtualStorage
        ) {
            roleRebalancer.create(spawn, capacity)
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
        sourcesManager.createHarvester(spawn, { roadsBuilt: roomQuery.allRoadsBuilt(), capacity })
        return
    }

    if (roomQuery.getCreepCount('mason') < MASON_COUNT && MasonCreep.shouldCreate(room)) {
        roleMason.create(spawn, capacity)
        return
    }
    createLatentWorkers(spawn, capacity)
}, 'rcl-2:swarm-strategy')

const linkStrategy = wrap((spawn: StructureSpawn): void => {
    if (spawn.room.energyAvailable < MIN_USEFUL_LINK_ENERGY) {
        return
    }

    const room = spawn.room
    const roomManager = new RoomManager(room)
    const sourcesManager = new SourcesManager(room)
    const haulers = getCreeps('energy-hauler', room)
    const virtualStorage = getVirtualStorage(room.name)
    const capacity = isEnergyRestricted(room)
        ? Math.min(MAX_USEFUL_ENERGY, room.energyCapacityAvailable)
        : room.energyCapacityAvailable
    const roomQuery = new RoomQuery(room)

    if (!sourcesManager.hasAllContainerHarvesters()) {
        sourcesManager.createHarvester(spawn, { capacity, roadsBuilt: roomQuery.allRoadsBuilt() })
        return
    }

    if (roomQuery.getCreepCount('energy-hauler') > 0) {
        for (const hauler of haulers as EnergyHauler[]) {
            if (
                roleEnergyHauler.shouldCancelAutoRenew(hauler, capacity, roomQuery.allRoadsBuilt())
            ) {
                roleEnergyHauler.cancelAutoRenew(hauler)
            }
        }
    }

    if (roomQuery.getCreepCount('logistics') < 1) {
        RoleLogistics.createCreep(spawn, PREFERENCE_WORKER, { capacity, noSuicide: true })
        return
    } else if (roomQuery.getCreepCount('energy-hauler') < 1) {
        roleEnergyHauler.create(spawn, capacity, roomQuery.allRoadsBuilt())
        return
    } else if (
        roomQuery.getCreepCount('rebalancer') < 1 &&
        virtualStorage &&
        roomQuery.linkCount() < 3
    ) {
        roleRebalancer.create(spawn, capacity)
        return
    } else if (
        roomQuery.getCreepCount('energy-hauler') < 2 &&
        roomQuery.getCreepCount('rebalancer') === 0 &&
        !isEnergyRestricted(room)
    ) {
        roleEnergyHauler.create(spawn, capacity, roomQuery.allRoadsBuilt())
        return
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
        roomQuery.getCreepCount('static-link-hauler') === 0 &&
        roleStaticLinkHauler.canCreate(spawn, capacity)
    ) {
        roleStaticLinkHauler.create(spawn, room.name, capacity)
        return
    }

    if (
        roomQuery.getCreepCount('static-upgrader') === 0 &&
        roleStaticUpgrader.canCreate(spawn, capacity)
    ) {
        roleStaticUpgrader.create(spawn, room.name, capacity)
        return
    }

    if (!sourcesManager.hasEnoughHarvesters()) {
        sourcesManager.createHarvester(spawn, { capacity, roadsBuilt: roomQuery.allRoadsBuilt() })
        return
    }

    if (roomQuery.getCreepCount('mason') < MASON_COUNT && MasonCreep.shouldCreate(room)) {
        roleMason.create(spawn, capacity)
        return
    }
    createLatentWorkers(spawn, capacity)
}, 'rcl-2:link-strategy')

// const createMineWorkers = wrap((spawn: StructureSpawn, capacity?: number): void => {},
// 'rcl-2:create-mine-workers')

const createLatentWorkers = wrap((spawn: StructureSpawn, capacity?: number): void => {
    if (!capacity) {
        capacity = spawn.room.energyAvailable
    }
    const room = spawn.room
    if (RoleLogistics.shouldCreateCreep(spawn, capacity)) {
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
            cerr = RoleLogistics.createCreep(spawn, PREFERENCE_WORKER, { capacity })
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
}, 'rcl-2:create-latent-workers')

function createWarCreeps(spawn: StructureSpawn, warDepartment: WarDepartment): number | null {
    const room = spawn.room
    const status = warDepartment.status
    const capacity = Math.min(MAX_USEFUL_ENERGY, room.energyCapacityAvailable)
    const scouts = getCreeps('scout', room).filter(
        (creep) =>
            creep.memory.tasks.length > 0 &&
            isTravelTask(creep.memory.tasks[0]) &&
            creep.memory.tasks[0].destination === warDepartment.target &&
            creep.memory.tasks[0].permanent,
    )
    const roomQuery = new RoomQuery(room)

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
        roomQuery.getCreepCount('attacker') < ATTACKERS_COUNT
    ) {
        return roleAttacker.create(spawn, warDepartment.target, capacity)
    }

    if (status === WarStatus.ATTACK) {
        if (warDepartment.hasHostileController()) {
            if (roomQuery.getCreepCount('claimer') === 0) {
                return roleClaimer.create(spawn, warDepartment.target, { attack: true })
            } else if (
                warDepartment.claimerSpotsAvailable() > roomQuery.getCreepCount('claimer') &&
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
        } else if (roomQuery.getCreepCount('claimer') === 0) {
            return roleClaimer.create(spawn, warDepartment.target, {
                minimal: warDepartment.canMinimallyClaim(),
            })
        } else if (
            warDepartment.claimerSpotsAvailable() > roomQuery.getCreepCount('claimer') &&
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
                return sourcesManager.createHarvester(spawn, { rescue: true })
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
        sourcesManager.createHarvester(spawn, { rescue: true })
    }
}

function updateRescueStatus(room: Room) {
    const stationaryPoints = getStationaryPoints(room)
    if (!stationaryPoints) {
        Logger.error('updateRescueStatus:missing-stationary-points', room.name)
        return
    }
    const sourceCount = Object.keys(stationaryPoints.sources).length
    const roomQuery = new RoomQuery(room)

    const selfSufficient =
        (roomQuery.getCreepCount('energy-hauler') > 0 &&
            roomQuery.getCreepCount('harvester') > 0) ||
        roomQuery.getCreepCount('logistics') > 0
    if (
        room.memory.collapsed &&
        roomQuery.getCreepCount('logistics') >= RESCUE_WORKER_COUNT &&
        roomQuery.getCreepCount('harvester') >= sourceCount
    ) {
        room.memory.collapsed = false
    } else if (!selfSufficient) {
        room.memory.collapsed = true
    }
}
