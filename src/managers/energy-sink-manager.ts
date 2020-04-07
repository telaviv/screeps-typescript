import includes from 'lodash/includes'

export default class EnergySinkManager {
    tasks: CreepTaskMemory[]

    constructor(tasks: CreepTaskMemory[]) {
        this.tasks = tasks
    }

    static create() {
        return new EnergySinkManager(Memory.tasks)
    }

    static get() {
        return EnergySinkManager.create()
    }

    static transfersAreFull(room: Room): boolean {
        const targets = room.find(FIND_STRUCTURES, {
            filter: EnergySinkManager.needsEnergy,
        })
        return targets.length === 0
    }

    static canRepairNonWalls(room: Room): boolean {
        const targets = room.find(FIND_STRUCTURES, {
            filter: EnergySinkManager.isRepairableNonWall,
        })
        return targets.length > 0
    }

    private static isRepairableNonWall(structure: Structure): boolean {
        if (
            includes(
                [STRUCTURE_RAMPART, STRUCTURE_WALL],
                structure.structureType,
            )
        ) {
            return false
        }
        return structure.hits < structure.hitsMax
    }

    private static needsEnergy(structure: Structure): boolean {
        if (
            structure.structureType === STRUCTURE_EXTENSION ||
            structure.structureType === STRUCTURE_SPAWN ||
            structure.structureType === STRUCTURE_TOWER
        ) {
            const s = structure as
                | StructureExtension
                | StructureSpawn
                | StructureTower
            return s.energy < s.energyCapacity
        }
        return false
    }
}
