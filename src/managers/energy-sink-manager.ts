/* eslint @typescript-eslint/no-explicit-any: ["off"] */

import includes from 'lodash/includes'

import { LogisticsCreep } from 'roles/logistics-constants'
import { getTowers } from 'utils/room'

const MIN_REPAIR_THRESHOLD = 0.66

export default class EnergySinkManager {
    static canRepairNonWalls(room: Room): boolean {
        const targets = room.find(FIND_STRUCTURES, {
            filter: createRepairableFilter(MIN_REPAIR_THRESHOLD),
        })
        return targets.length > 0
    }

    static findRepairTarget(
        creep: LogisticsCreep,
        repairThreshold = MIN_REPAIR_THRESHOLD,
    ): Structure | null {
        const targets = creep.room.find(FIND_STRUCTURES, {
            filter: createRepairableFilter(repairThreshold),
        })
        if (targets.length === 0) {
            return null
        }
        return creep.pos.findClosestByRange(targets) as Structure
    }
}

const createRepairableFilter = (minThreshold: number): ((structure: Structure) => boolean) => {
    return (structure: Structure) => isRepairableNonWall(structure, minThreshold)
}

function isRepairableNonWall(structure: Structure, minThreshold = MIN_REPAIR_THRESHOLD): boolean {
    if (includes([STRUCTURE_RAMPART, STRUCTURE_WALL], structure.structureType)) {
        return false
    }
    if (structure.structureType === STRUCTURE_ROAD) {
        const towers = getTowers(structure.room)
        if (towers.length > 0) {
            return false
        }
    }
    if (structure.structureType === STRUCTURE_TOWER) {
        // [FIX] - dedupe this
        const hitsDifference = structure.hitsMax - structure.hits
        return hitsDifference >= CARRY_CAPACITY
    }
    return structure.hits / structure.hitsMax < minThreshold
}
