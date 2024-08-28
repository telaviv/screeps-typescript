import * as Logger from 'utils/logger'

import { DataPoint, exponential, logarithmic, polynomial, Result } from 'regression'
import { LATENT_WORKER_INTERVAL_MULTIPLIER } from './constants'
import { getSlidingEnergy } from 'room-window'
import { wrap } from 'utils/profiling'

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

export function minAvailableEnergy(room: Room): number {
    return regressions[0][1].predict(room.energyCapacityAvailable)[1]
}

export const isEnergyRestricted = wrap((room: Room): boolean => {
    const minEnergy = minAvailableEnergy(room)
    return (
        getSlidingEnergy(room.memory, 99) < minEnergy ||
        getSlidingEnergy(room.memory, 999) < minEnergy
    )
}, 'rcl-2:isEnergyRestricted')
