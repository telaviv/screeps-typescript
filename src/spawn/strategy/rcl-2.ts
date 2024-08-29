import * as Logger from 'utils/logger'
import {
    PREFERENCE_WORKER,
    TASK_BUILDING,
    TASK_REPAIRING,
    TASK_UPGRADING,
} from 'roles/logistics-constants'
import {
    SPAWN_CHECK_MOD,
    MAX_USEFUL_ENERGY,
    MAX_DROPPED_RESOURCES,
    MIN_USEFUL_LINK_ENERGY,
    ATTACKERS_COUNT,
    BUILDERS_COUNT,
    MASON_COUNT,
    RESCUE_WORKER_COUNT,
    UPGRADERS_COUNT,
} from './constants'
import WarDepartment, { WarStatus } from 'war-department'
import { getCreeps, getLogisticsCreeps } from 'utils/creep'
import { getLatentWorkerInterval, isEnergyRestricted } from './utils'
import roleEnergyHauler, { EnergyHauler } from 'roles/energy-hauler'
import roleMason, { MasonCreep } from 'roles/mason'
import DefenseDepartment from 'defense-department'
import { MineManager } from 'managers/mine-manager'
import RoleLogistics from 'roles/logistics'
import { RoomManager } from 'managers/room-manager'
import RoomQuery from 'spawn/room-query'
import SourcesManager from 'managers/sources-manager'
import { createWarCreeps } from './create-war-creeps'
import { getConstructionSites } from 'utils/room'
import { getStationaryPoints } from 'construction-features'
import { getVirtualStorage } from 'utils/virtual-storage'
import hash from 'utils/hash'
import roleAttacker from 'roles/attacker'
import roleClaimer from 'roles/claim'
import roleHealer from 'roles/healer'
import roleRebalancer from 'roles/rebalancer'
import roleRemoteHauler from 'roles/remote-hauler'
import roleStaticLinkHauler from 'roles/static-link-hauler'
import roleStaticUpgrader from 'roles/static-upgrader'
import { wrap } from 'utils/profiling'

declare global {
    interface RoomMemory {
        lastLatentWorker?: number
    }
}

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
    const defenseDepartment = new DefenseDepartment(spawn.room)
    const capacity = isEnergyRestricted(room)
        ? Math.min(MAX_USEFUL_ENERGY, room.energyCapacityAvailable)
        : room.energyCapacityAvailable
    const roomQuery = new RoomQuery(room)

    if (roomManager.getScoutRoomTasks().length > 0) {
        roomManager.scoutRoom()
        return
    }

    if (room.energyAvailable < SPAWN_ENERGY_CAPACITY) {
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

    if (roomQuery.getCreepCount('energy-hauler') < 1) {
        roleEnergyHauler.create(spawn, capacity, roomQuery.allRoadsBuilt())
        return
    }

    if (roomQuery.getLogisticsCreepCount({ preference: PREFERENCE_WORKER }) < 1) {
        RoleLogistics.createCreep(spawn, PREFERENCE_WORKER, { capacity })
        return
    }

    if (!sourcesManager.hasEnoughHarvesters()) {
        sourcesManager.createHarvester(spawn, { roadsBuilt: roomQuery.allRoadsBuilt(), capacity })
        return
    }

    if (roomQuery.getLogisticsCreepCount({ preference: TASK_UPGRADING }) < UPGRADERS_COUNT) {
        RoleLogistics.createCreep(spawn, TASK_UPGRADING, { capacity })
        return
    }

    if (
        roomQuery.getLogisticsCreepCount({ preference: TASK_BUILDING }) < BUILDERS_COUNT &&
        constructionSites.length > 0
    ) {
        RoleLogistics.createCreep(spawn, TASK_BUILDING, { capacity })
        return
    }

    if (roomQuery.getCreepCount('rebalancer') < 1 && virtualStorage) {
        roleRebalancer.create(spawn, capacity)
        return
    }

    if (
        roomQuery.getCreepCount('rebalancer') < 2 &&
        roomQuery.getDroppedResourceCount() > MAX_DROPPED_RESOURCES &&
        virtualStorage
    ) {
        roleRebalancer.create(spawn, capacity)
        return
    }

    const warDepartment = new WarDepartment(spawn.room)
    if (warDepartment.status !== WarStatus.NONE) {
        const err = createWarCreeps(spawn, warDepartment)
        if (err === OK) {
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

    if (roomQuery.getCreepCount('mason') < MASON_COUNT && MasonCreep.shouldCreate(room)) {
        roleMason.create(spawn, capacity)
        return
    }

    if (roomQuery.allRoadsBuilt() && Memory.miningEnabled) {
        for (const mm of roomQuery.getMineManagers()) {
            if (mm.needsAttention()) {
                createMineWorkers(spawn, capacity, mm)
                return
            }
        }
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

    const warDepartment = new WarDepartment(spawn.room)
    if (warDepartment.status !== WarStatus.NONE) {
        const err = createWarCreeps(spawn, warDepartment)
        if (err === OK) {
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

    if (roomQuery.allRoadsBuilt() && Memory.miningEnabled) {
        for (const mm of roomQuery.getMineManagers()) {
            if (mm.needsAttention()) {
                createMineWorkers(spawn, capacity, mm)
                return
            }
        }
    }

    createLatentWorkers(spawn, capacity)
}, 'rcl-2:link-strategy')

const createMineWorkers = wrap(
    (spawn: StructureSpawn, capacity: number, mineManager: MineManager): void => {
        if (!mineManager.room) {
            roleClaimer.create(spawn, mineManager.name, { reserve: true, capacity })
            return
        }

        const defenders = mineManager.getDefenders()
        if (mineManager.needsProtection() && defenders.length < ATTACKERS_COUNT) {
            roleAttacker.create(spawn, mineManager.name, capacity)
            return
        }

        if (!mineManager.hasEnoughReservers() && mineManager.hasClaimSpotAvailable()) {
            roleClaimer.create(spawn, mineManager.name, { reserve: true, capacity })
            return
        }

        if (mineManager.needsHealer()) {
            roleHealer.create(spawn, mineManager.name)
        }

        if (!mineManager.hasEnoughConstructionParts() && mineManager.getWorkers().length === 0) {
            RoleLogistics.createCreep(spawn, PREFERENCE_WORKER, {
                home: mineManager.name,
                capacity,
            })
            return
        }

        if (!mineManager.hasEnoughHarvesters()) {
            const sourcesManager = new SourcesManager(mineManager.room)
            sourcesManager.createHarvester(spawn, { capacity })
            return
        }

        if (!mineManager.hasEnoughConstructionParts()) {
            RoleLogistics.createCreep(spawn, PREFERENCE_WORKER, {
                home: mineManager.name,
                capacity,
            })
            return
        }

        if (!mineManager.hasEnoughHaulers()) {
            roleRemoteHauler.create(spawn, { remote: mineManager.name, capacity })
            return
        }

        if (mineManager.needsRepairs()) {
            console.log('creating repairer', mineManager.name)
            RoleLogistics.createCreep(spawn, TASK_REPAIRING, {
                home: mineManager.name,
                capacity,
                noRepairLimit: true,
            })
            return
        }
    },
    'rcl-2:create-mine-workers',
)

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
        (roomQuery.getCreepCount('logistics') > 0 && roomQuery.getCreepCount('energy-hauler') === 0)
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
