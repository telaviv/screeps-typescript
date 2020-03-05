import { minBy } from 'utils/lodash'
import { StrategyPhase } from 'strategy'
import DroppedEnergy from 'dropped-energy'

interface SourceCounts {
    [index: string]: number
}

function getSourceCounts(room: Room, role: string): SourceCounts {
    const counts: SourceCounts = {}
    for (const source of room.memory.sources) {
        counts[source.id] = 0
    }
    for (const creep of Object.values(Memory.creeps)) {
        if (creep.role === role) {
            const harvesterMemory = creep as SourceMemory
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
    if (!droppedEnergy.canPickup(creep)) {
        harvestEnergy(creep)
        return
    }

    const target = droppedEnergy.pos.lookFor(LOOK_ENERGY)

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
    const roomMemory = Memory.rooms[creep.room.name]
    if (roomMemory.strategy === StrategyPhase.DropMining) {
        pickupEnergy(creep)
    } else {
        harvestEnergy(creep)
    }
}
