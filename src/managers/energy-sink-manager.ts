/* eslint @typescript-eslint/no-explicit-any: ["off"] */

import includes from 'lodash/includes'

import { LogisticsCreep } from 'roles/logistics-constants'
import { getTowers } from 'utils/room'

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
        return structure.hits / structure.hitsMax < 0.66
    }
}
