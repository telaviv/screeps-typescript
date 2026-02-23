import * as Logger from 'utils/logger'

import { DataPoint, exponential, logarithmic, polynomial, Result } from 'regression'
import { LATENT_WORKER_INTERVAL_MULTIPLIER } from './constants'
import { getSlidingEnergy } from 'room-window'
import { wrap } from 'utils/profiling'
import RoomQuery from '../room-query'

/** Calculates delay between spawning "latent" workers based on room's energy capacity */
export function getLatentWorkerInterval(room: Room): number {
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

/**
 * Uses regression model to predict minimum energy threshold for a room.
 * Higher capacity rooms should maintain higher energy reserves.
 * The model is fitted against empirically-tuned data points.
 */
export function minAvailableEnergy(room: Room): number {
    return regressions[0][1].predict(room.energyCapacityAvailable)[1]
}

/**
 * Checks if room's average energy (over 99 or 999 ticks) is below threshold.
 * Used to limit spawning of non-essential creeps when energy is low.
 */
export const isEnergyRestricted = wrap((room: Room): boolean => {
    const minEnergy = minAvailableEnergy(room)
    return (
        getSlidingEnergy(room.name, 99) < minEnergy || getSlidingEnergy(room.name, 999) < minEnergy
    )
}, 'rcl-2:isEnergyRestricted')

const CLAIMER_MIN = BODYPART_COST[CLAIM] + BODYPART_COST[MOVE]
const WORKER_MIN = 2 * BODYPART_COST[MOVE] + BODYPART_COST[CARRY] + BODYPART_COST[WORK]

/**
 * Returns the energy capacity to use when operating in limited mode.
 * Uses the cheapest useful creep as the floor:
 * - claim+move (650) if the room can afford it, otherwise move×2+carry+work (250)
 */
export function getLimitedCapacity(room: Room): number {
    const cap = room.energyCapacityAvailable
    const minFloor = cap >= CLAIMER_MIN ? CLAIMER_MIN : WORKER_MIN
    return Math.min(cap, Math.max(minFloor, room.energyAvailable))
}

/**
 * Returns true if the room should spawn all creeps at limited capacity.
 * Combines energy restriction with the mine lower-capacity condition: any mine that
 * needs attention triggers limited capacity if it has low reservation (≤1000 ticks) and
 * still has claimer spots available (skipped below RCL 3 where claimers can't be spawned),
 * or has fewer than 1 hauler per source. Mine logic is only checked when roads are built
 * for both the base room and the mine's own room, matching the gate used in the spawn strategy.
 */
export function shouldOperateAtLimitedCapacity(room: Room, roomQuery: RoomQuery): boolean {
    if (isEnergyRestricted(room)) return true
    if (Memory.miningEnabled && roomQuery.allRoadsBuilt()) {
        const canAffordClaimer = (room.controller?.level ?? 0) >= 3
        for (const mm of roomQuery.getMineManagers()) {
            if (!mm.needsAttention() || !mm.room) continue
            const mineQuery = new RoomQuery(mm.room)
            if (!mineQuery.allRoadsBuilt()) continue
            const hasHaulerPerSource = mm.getHaulers().length >= mm.sourceCount()
            const claimerSpotAvailable = mm.hasClaimSpotAvailable()
            const reservationTicks = mm.controllerReservationTicksLeft()
            if (
                (canAffordClaimer && reservationTicks <= 1000 && claimerSpotAvailable) ||
                !hasHaulerPerSource
            ) {
                return true
            }
        }
    }
    return false
}
