/* eslint @typescript-eslint/no-explicit-any: ["off"] */

import includes from 'lodash/includes'

import { LogisticsCreep } from 'roles/logistics-constants'
import { getTowers } from 'utils/room'
import { mprofile } from 'utils/profiling'

/** Minimum health ratio threshold for repairs (66%) */
const MIN_REPAIR_THRESHOLD = 0.66

/**
 * Manages energy sinks for repair operations.
 * Finds and prioritizes structures that need repair.
 */
export default class EnergySinkManager {
    /**
     * Checks if any non-wall structures need repair.
     * @param room - The room to check
     */
    @mprofile('EnergySinkManager:canRepairNonWalls')
    static canRepairNonWalls(room: Room): boolean {
        const targets = room.find(FIND_STRUCTURES, {
            filter: createRepairableFilter(MIN_REPAIR_THRESHOLD),
        })
        return targets.length > 0
    }

    /**
     * Finds the closest structure needing repair.
     * @param creep - The creep to find repair target for
     * @param repairThreshold - Health ratio threshold (default 0.66)
     * @returns Closest repairable structure or null
     */
    @mprofile('EnergySinkManager:findRepairTarget')
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

/**
 * Creates a filter function for repairable non-wall structures.
 * @param minThreshold - Minimum health ratio to trigger repair
 */
const createRepairableFilter = (minThreshold: number): ((structure: Structure) => boolean) => {
    return (structure: Structure) => isRepairableNonWall(structure, minThreshold)
}

/**
 * Checks if a structure is repairable and not a wall/rampart.
 * @param structure - The structure to check
 * @param minThreshold - Minimum health ratio threshold
 */
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
