import { hash } from 'immutable'

import * as WithdrawTask from 'tasks/withdraw'
import * as PickupTask from 'tasks/pickup'
import { ResourceCreep } from 'tasks/types'

export function isFullOfEnergy(creep: Creep) {
    return creep.store.getFreeCapacity(RESOURCE_ENERGY) === 0
}

export function hasNoEnergy(creep: Creep) {
    return creep.store.getUsedCapacity(RESOURCE_ENERGY) === 0
}

export function freeEnergyCapacity(creep: Creep) {
    return creep.store.getFreeCapacity(RESOURCE_ENERGY)
}

export function getEnergy(creep: ResourceCreep): boolean {
    return getEnergyTask(creep)
}

export function getEnergyTask(creep: ResourceCreep): boolean {
    if (!PickupTask.makeRequest(creep)) {
        if (!WithdrawTask.makeRequest(creep)) {
            return false
        }
    }
    return true
}
