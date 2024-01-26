import { hash } from 'immutable'

import * as WithdrawTask from 'tasks/withdraw'
import * as PickupTask from 'tasks/pickup'
import * as Logger from 'utils/logger'
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
    if (creep.room.name !== creep.memory.home) {
        const sources = creep.room.find(FIND_SOURCES_ACTIVE)
        if (sources.length > 0) {
            const target = sources[hash(creep.name) % sources.length]
            if (creep.harvest(target) === ERR_NOT_IN_RANGE) {
                const err = creep.moveTo(target, {
                    visualizePathStyle: { stroke: '#ffaa00' },
                })
                return err === OK
            }
        }
        Logger.warning('getEnergy:failed:noSources', creep.name, creep.room.name)
        return false
    }

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
