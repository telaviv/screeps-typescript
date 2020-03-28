import { minBy } from 'utils/lodash'
import DroppedEnergy from 'dropped-energy'

interface SourceCounts {
    [index: string]: number
}

function getSourceCounts(room: Room, role: string): SourceCounts {
    const counts: SourceCounts = {}
    for (const source of room.memory.sources) {
        counts[source.id] = 0
    }
    for (const [creepName, creepMemory] of Object.entries(Memory.creeps)) {
        const creep = Game.creeps[creepName]
        if (creepMemory.role === role && creep.room.name === room.name) {
            const harvesterMemory = creepMemory as SourceMemory
            counts[harvesterMemory.source] += 1
        }
    }
    return counts
}

export function getNextSource(room: Room, role: string): string {
    const sourceCounts = getSourceCounts(room, role)
    return minBy(Object.keys(sourceCounts), id => sourceCounts[id])
}

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
    const droppedEnergy = new DroppedEnergy(sourceMemory.dropSpot)
    const target = droppedEnergy.pos.lookFor(LOOK_ENERGY)

    if (
        target.length === 0 ||
        target[0].amount < creep.store.getFreeCapacity(RESOURCE_ENERGY)
    ) {
        harvestEnergy(creep)
        return
    }

    const err = creep.pickup(target[0])
    if (err === ERR_NOT_IN_RANGE) {
        const harvestPos = sourceMemory.dropSpot.pos
        creep.moveTo(harvestPos.x, harvestPos.y, {
            range: 1,
            visualizePathStyle: { stroke: '#ffaa00' },
        })
    } else if (err === OK) {
        droppedEnergy.completeRequest(creep)
    }
}

export function isFullOfEnergy(creep: Creep) {
    return creep.store.getFreeCapacity(RESOURCE_ENERGY) === 0
}

export function hasNoEnergy(creep: Creep) {
    return creep.store.getUsedCapacity(RESOURCE_ENERGY) === 0
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
