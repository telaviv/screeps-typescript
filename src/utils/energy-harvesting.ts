import { hash } from 'immutable'

import * as WithdrawTask from 'tasks/withdraw'
import * as PickupTask from 'tasks/pickup'
import { getActiveSources } from 'utils/room'
import { randomElement } from 'utils/utilities'
import RoleLogistics from 'roles/logistics'

export function harvestEnergy(creep: ResourceCreep) {
    const sources = getActiveSources(creep.room)
    const source = creep.pos.findClosestByPath(sources)
    if (!source) {
        wander(creep)
        RoleLogistics.idle(creep)
    } else if (creep.harvest(source) === ERR_NOT_IN_RANGE) {
        creep.moveTo(source, {
            visualizePathStyle: { stroke: '#ffaa00' },
            range: 1,
        })
        RoleLogistics.idle(creep)
    } else {
        RoleLogistics.unidle(creep)
    }
}

export function wander(creep: Creep) {
    const direction = randomElement<DirectionConstant>([
        TOP,
        TOP_RIGHT,
        RIGHT,
        BOTTOM_RIGHT,
        BOTTOM,
        BOTTOM_LEFT,
        LEFT,
        TOP_LEFT,
    ])
    creep.move(direction)
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

export function getEnergy(creep: ResourceCreep): void {
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

    if (!PickupTask.makeRequest(creep)) {
        if (!WithdrawTask.makeRequest(creep)) {
            harvestEnergy(creep)
        }
    }
}
