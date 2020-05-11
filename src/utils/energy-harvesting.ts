import EnergyManager from 'managers/energy-manager'
import SourceManager from 'managers/source-manager'
import DroppedEnergyManager from 'managers/dropped-energy-manager'
import { LogisticsCreep, isLogisticsCreep } from 'roles/logistics-constants'
import * as WithdrawTask from 'tasks/withdraw'
import { fromRoom } from 'utils/immutable-room'

function harvestEnergy(creep: SourceCreep) {
    const source = Game.getObjectById(creep.memory.source) as Source
    if (creep.harvest(source) === ERR_NOT_IN_RANGE) {
        creep.memory.waitTime += 1
        creep.moveTo(source, {
            visualizePathStyle: { stroke: '#ffaa00' },
        })
    } else {
        creep.memory.waitTime = 0
    }
}

function requestSourceEnergy(creep: SourceCreep): boolean {
    if (isLogisticsCreep(creep) && WithdrawTask.makeRequest(creep)) {
        return true
    }

    const originalDroppedEnergy = getDropSpotManager(creep)

    // this happens when a creep gets lost and forgets they have a request.
    if (originalDroppedEnergy.hasRequest(creep)) {
        return true
    }

    const capacity = freeEnergyCapacity(creep)
    const energyManager = EnergyManager.get(creep.room)
    const source = energyManager.findLogisticsAssignment(capacity)
    if (source === null) {
        creep.memory.waitTime += 1
        return false
    }

    const droppedEnergy = SourceManager.getById(source).droppedEnergy
    creep.memory.source = source
    if (!droppedEnergy.request(creep)) {
        throw new Error(`this should be impossible ${creep.name}`)
    }
    return true
}

function pickupEnergy(creep: SourceCreep) {
    const droppedEnergy = getDropSpotManager(creep)
    const target = droppedEnergy.pos.lookFor(LOOK_ENERGY)
    const err = creep.pickup(target[0])
    if (err === ERR_NOT_IN_RANGE) {
        creep.moveTo(droppedEnergy.pos.x, droppedEnergy.pos.y, {
            range: 1,
            visualizePathStyle: { stroke: '#ffaa00' },
        })
    }
    return err
}

function withdrawEnergy(creep: SourceCreep) {
    const droppedEnergy = getDropSpotManager(creep)
    const container = getDropContainer(creep)

    if (container === null) {
        throw new Error('this should never be called without a container')
    }

    const err = creep.withdraw(container, RESOURCE_ENERGY)
    if (err === ERR_NOT_IN_RANGE) {
        creep.moveTo(droppedEnergy.pos.x, droppedEnergy.pos.y, {
            range: 1,
            visualizePathStyle: { stroke: '#ffaa00' },
        })
    }
    return err
}

export function getDropContainer(
    creep: SourceCreep,
): StructureContainer | null {
    return getDropSpotManager(creep).getContainer()
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

function getSourceManager(creep: SourceCreep): SourceManager {
    return SourceManager.getById(creep.memory.source)
}

function getDropSpotManager(creep: SourceCreep): DroppedEnergyManager {
    return getSourceManager(creep).droppedEnergy
}

export function getEnergy(creep: LogisticsCreep) {
    if (creep.room.name !== creep.memory.home) {
        const target = creep.pos.findClosestByRange(FIND_SOURCES_ACTIVE)
        if (target) {
            if (creep.harvest(target) === ERR_NOT_IN_RANGE) {
                creep.moveTo(target)
            }
        }
    }

    let sourceManager = getSourceManager(creep)
    if (!sourceManager.hasStaticHarvester()) {
        harvestEnergy(creep)
    }

    if (!requestSourceEnergy(creep)) {
        return
    }

    let err
    sourceManager = getSourceManager(creep)
    if (sourceManager.isContainerMining()) {
        err = withdrawEnergy(creep)
    } else {
        err = pickupEnergy(creep)
    }

    if (err === OK) {
        sourceManager.droppedEnergy.completeRequest(creep)
    }
}
