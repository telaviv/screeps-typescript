import EnergyManager from 'managers/energy-manager'
import SourceManager from 'managers/source-manager'
import DroppedEnergyManager from 'managers/dropped-energy-manager'
import { fromRoom } from 'utils/immutable-room'

const SUICIDE_TIME = 200

function harvestEnergy(creep: SourceCreep) {
    const source = Game.getObjectById(creep.memory.source) as Source
    if (creep.harvest(source) === ERR_NOT_IN_RANGE) {
        creep.moveTo(source, {
            visualizePathStyle: { stroke: '#ffaa00' },
        })
    }
}

function pickupEnergy(creep: SourceCreep) {
    const sourceManager = getSourceManager(creep)
    const droppedEnergy = sourceManager.droppedEnergy

    if (!sourceManager.hasStaticHarvester()) {
        harvestEnergy(creep)
        return
    }

    if (!requestSourceEnergy(creep)) {
        return
    }

    const err = rawPickupEnergy(creep)

    if (err === OK) {
        droppedEnergy.completeRequest(creep)
    }
}

function requestSourceEnergy(creep: SourceCreep): boolean {
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
        creep.say('😴')
        if (creep.memory.waitTime >= SUICIDE_TIME) {
            creep.suicide()
        }
        return false
    }

    const droppedEnergy = SourceManager.getById(source).droppedEnergy
    creep.memory.source = source
    if (!droppedEnergy.request(creep)) {
        throw new Error(`this should be impossible ${creep.name}`)
    }
    return true
}

function rawPickupEnergy(creep: SourceCreep) {
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

export function getEnergy(creep: SourceCreep) {
    pickupEnergy(creep)
}
