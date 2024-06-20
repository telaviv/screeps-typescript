/* eslint @typescript-eslint/no-explicit-any: ["off"] */

import includes from 'lodash/includes'

import { LogisticsCreep } from 'roles/logistics-constants'

export default class EnergySinkManager {
    static canRepairNonWalls(room: Room): boolean {
        const targets = room.find(FIND_STRUCTURES, {
            filter: EnergySinkManager.isRepairableNonWall,
        })
        return targets.length > 0
    }

    static findRepairTarget(creep: LogisticsCreep): Structure | null {
        const targets = creep.room.find(FIND_STRUCTURES, {
            filter: EnergySinkManager.isRepairableNonWall,
        })
        if (targets.length === 0) {
            return null
        }
        return creep.pos.findClosestByRange(targets) as Structure
    }

    private static isRepairableNonWall(this: void, structure: Structure): boolean {
        if (
            includes([STRUCTURE_RAMPART, STRUCTURE_WALL, STRUCTURE_ROAD], structure.structureType)
        ) {
            return false
        }
        const hitsDifference = structure.hitsMax - structure.hits
        if (structure.structureType === STRUCTURE_TOWER) {
            // [FIX] - dedupe this
            return hitsDifference >= CARRY_CAPACITY
        }
        return hitsDifference > 0
    }
}
