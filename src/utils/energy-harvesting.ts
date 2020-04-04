import EnergyManager from 'managers/energy-manager'
import SourceManager from 'managers/source-manager'
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
    const sourceMemory = getSourceMemory(creep)
    const sourceManager = SourceManager.get(sourceMemory)
    const droppedEnergy = sourceManager.droppedEnergy

    if (!sourceManager.hasStaticHarvester()) {
        harvestEnergy(creep)
        return
    }

    const capacity = freeEnergyCapacity(creep)
    const energyManager = EnergyManager.get(creep.room)
    const assignment = energyManager.findLogisticsAssignment(capacity)

    if (assignment === null) {
        creep.memory.waitTime += 1
        creep.say('😴')
        if (creep.memory.waitTime >= SUICIDE_TIME) {
            creep.suicide()
        }
        return
    }
    const oldSource = creep.memory.source
    if (oldSource !== assignment) {
        console.log('creep-switch', creep.name, oldSource, assignment)
    }

    creep.memory.source = assignment
    const err = rawPickupEnergy(creep)

    if (err === OK) {
        droppedEnergy.completeRequest(creep)
    }
}

function rawPickupEnergy(creep: SourceCreep) {
    const sourceMemory = getSourceMemory(creep)
    const sourceManager = SourceManager.get(sourceMemory)
    const droppedEnergy = sourceManager.droppedEnergy
    const target = droppedEnergy.pos.lookFor(LOOK_ENERGY)
    const err = creep.pickup(target[0])
    if (err === ERR_NOT_IN_RANGE) {
        const harvestPos = sourceMemory.dropSpot.pos
        creep.moveTo(harvestPos.x, harvestPos.y, {
            range: 1,
            visualizePathStyle: { stroke: '#ffaa00' },
        })
    }
    return err
}

function wander(creep: Creep) {
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

function getSourceMemory(creep: SourceCreep): RoomSourceMemory {
    const roomMemory = Memory.rooms[creep.room.name]
    const sourceMemory = roomMemory.sources.find(
        s => s.id === creep.memory.source,
    )
    if (!sourceMemory) {
        throw Error("Somehow we don't have memory")
    }

    return sourceMemory
}

export function getEnergy(creep: SourceCreep) {
    pickupEnergy(creep)
}
