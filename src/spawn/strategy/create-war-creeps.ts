import * as Logger from 'utils/logger'
import { ATTACKERS_COUNT, MAX_USEFUL_ENERGY } from './constants'
import WarDepartment, { WarStatus } from 'war-department'
import { getCreeps, getLogisticsCreeps } from 'utils/creep'
import roleAttacker, { AttackerMemory } from 'roles/attacker'
import roleHealer, { HealerMemory } from 'roles/healer'
import { PREFERENCE_WORKER } from 'roles/logistics-constants'
import RoleLogistics from 'roles/logistics'
import RoomQuery from 'spawn/room-query'
import SourcesManager from 'managers/sources-manager'
import { isEnergyRestricted } from './utils'
import { isTravelTask } from 'tasks/travel/utils'
import roleClaimer from 'roles/claim'
import roleScout from 'roles/scout'
import { wrap } from 'utils/profiling'

/**
 * Spawns creeps for war operations based on WarStatus.
 * Handles scouts, attackers/healers (paired), claimers, and remote workers.
 * Returns OK if spawned, null if nothing needed.
 */
export const createImportantWarCreeps = wrap((spawn: StructureSpawn, warDepartment: WarDepartment):
    | number
    | null => {
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
        Logger.info(
            'create-war-creeps:safe-mode-check:failed',
            warDepartment.hasSafeMode(),
            warDepartment.hasOverwhelmingForce(),
        )
        return null
    }

    if (warDepartment.targetRoom === undefined && warDepartment.status !== WarStatus.ATTACK) {
        if (scouts.length === 0) {
            return roleScout.create(spawn, warDepartment.target, true)
        }
        Logger.info('create-war-creeps:scout-check:failed', scouts.length)
        return null
    }

    if (warDepartment.needsProtection && roomQuery.getCreepCount('attack') < ATTACKERS_COUNT) {
        return roleAttacker.create(spawn, warDepartment.target, capacity)
    }

    const attackers = room
        .find(FIND_MY_CREEPS)
        .filter(
            (c) => c.memory.role === 'attack' && (c.memory as AttackerMemory).asPair === true,
        ).length
    const healers = room
        .find(FIND_MY_CREEPS)
        .filter(
            (c) => c.memory.role === 'healer' && (c.memory as HealerMemory).asPair === true,
        ).length
    if (status === WarStatus.ATTACK) {
        Logger.info('war-stuff', room.name, attackers, healers)
        if (attackers < ATTACKERS_COUNT * 2 && attackers <= healers) {
            return roleAttacker.create(spawn, warDepartment.target, capacity, null, false)
        } else if (healers < ATTACKERS_COUNT && healers < attackers) {
            return roleHealer.create(spawn, warDepartment.target, true, true)
        } else if (warDepartment.hasHostileController()) {
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

    if (!warDepartment.targetRoom) {
        return null
    }
    const remoteWorkers = getLogisticsCreeps({ room: warDepartment.targetRoom })
    for (const creep of remoteWorkers) {
        Logger.info(
            'create-war-creeps:remote-workers',
            creep.name,
            creep.room.name,
            creep.pos.x,
            creep.pos.y,
        )
    }
    const sourcesManager = SourcesManager.create(warDepartment.targetRoom)
    if (!sourcesManager) {
        return null
    }

    if (status === WarStatus.CLAIM || status === WarStatus.CLEAR_OWNER) {
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
        Logger.info('create-war-creeps', 'spawn', remoteWorkers.length, isEnergyRestricted(room))
        if (remoteWorkers.length === 0) {
            Logger.info('create-war-creeps:no-remote-workers')
            return RoleLogistics.createCreep(spawn, PREFERENCE_WORKER, {
                home: warDepartment.target,
            })
        }

        if (remoteWorkers.length < 2) {
            Logger.info('create-war-creeps:remote-workers-less-than-2')
            return RoleLogistics.createCreep(spawn, PREFERENCE_WORKER, {
                home: warDepartment.target,
            })
        } else if (!sourcesManager.hasAllContainerHarvesters()) {
            Logger.info('create-war-creeps:missing-container-harvesters')
            return sourcesManager.createHarvester(spawn, { rescue: true })
        } else if (remoteWorkers.length < 4) {
            Logger.info('create-war-creeps:preference-worker')
            return RoleLogistics.createCreep(spawn, PREFERENCE_WORKER, {
                home: warDepartment.target,
            })
        }
    }
    return null
}, 'createWarCreeps')

/** Spawns extra workers for war target room when in SPAWN status (bootstrapping new room) */
export const createLatentSpawnWorkers = (
    spawn: StructureSpawn,
    warDepartment: WarDepartment,
): number | null => {
    if (warDepartment.status !== WarStatus.SPAWN) {
        return null
    }
    return RoleLogistics.createCreep(spawn, PREFERENCE_WORKER, {
        home: warDepartment.target,
    })
}
