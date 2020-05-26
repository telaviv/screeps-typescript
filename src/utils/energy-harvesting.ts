import { hash } from 'immutable'

import { LogisticsCreep, isLogisticsCreep } from 'roles/logistics-constants'
import * as WithdrawTask from 'tasks/withdraw'
import * as PickupTask from 'tasks/pickup'
import { fromRoom } from 'utils/immutable-room'
import { getActiveSources } from 'utils/room'

export function harvestEnergy(creep: LogisticsCreep) {
    const sources = getActiveSources(creep.room)
    const source = creep.pos.findClosestByPath(sources)
    if (source && creep.harvest(source) === ERR_NOT_IN_RANGE) {
        creep.memory.waitTime += 1
        creep.moveTo(source, {
            visualizePathStyle: { stroke: '#ffaa00' },
            range: 1,
        })
    } else {
        creep.memory.waitTime = 0
    }
}

export function wander(creep: Creep) {
    const iroom = fromRoom(creep.room)
    const pos = iroom.getRandomWalkablePosition(creep.pos.x, creep.pos.y)
    if (pos) {
        creep.moveTo(pos)
    }
    creep.say('🤔')
}

export function isFullOfEnergy(creep: Creep) {
    return creep.store.getFreeCapacity(RESOURCE_ENERGY) === 0
}

export function hasNoEnergy(creep: Creep) {
    return creep.store.getUsedCapacity(RESOURCE_ENERGY) === 0
}

export function freeEnergyCapacity(creep: Creep) {
    return creep.store.getFreeCapacity(RESOURCE_ENERGY)
}

export function getEnergy(creep: LogisticsCreep): void {
    if (creep.room.name !== creep.memory.home) {
        const sources = creep.room.find(FIND_SOURCES_ACTIVE)
        if (sources.length > 0) {
            const target = sources[hash(creep.name) % sources.length]
            if (creep.harvest(target) === ERR_NOT_IN_RANGE) {
                creep.moveTo(target, {
                    visualizePathStyle: { stroke: '#ffaa00' },
                })
            }
        }
        return
    }

    if (isLogisticsCreep(creep)) {
        if (!PickupTask.makeRequest(creep)) {
            if (!WithdrawTask.makeRequest(creep)) {
                harvestEnergy(creep)
            }
        }
    }
}
