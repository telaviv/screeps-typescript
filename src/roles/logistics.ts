import filter from 'lodash/filter'
import { getBuildManager } from 'build-manager'
import { getEnergy, isFullOfEnergy, hasNoEnergy } from 'utils/energy-harvesting'
import { wrap } from 'utils/profiling'
import {
    getConstructionSites,
    isAtExtensionCap,
    findWeakestStructure,
} from 'utils/room'
import {
    TASK_HAULING,
    TASK_BUILDING,
    TASK_UPGRADING,
    TASK_REPAIRING,
    TASK_COLLECTING,
    DeliveryTask,
    Logistics,
    LogisticsMemory,
} from './logistics-constants'

const ROLE = 'logistics'

const roleLogistics = {
    run: wrap((creep: Logistics) => {
        roleLogistics.updateMemory(creep)
        const currentTask = creep.memory.currentTask

        if (currentTask === TASK_COLLECTING) {
            getEnergy(creep)
        } else if (currentTask === TASK_HAULING) {
            roleLogistics.haulEnergy(creep)
        } else if (currentTask === TASK_BUILDING) {
            roleLogistics.build(creep)
        } else if (currentTask === TASK_UPGRADING) {
            roleLogistics.upgrade(creep)
        } else if (currentTask === TASK_REPAIRING) {
            roleLogistics.repair(creep)
        }
    }, 'runLogistics'),

    updateMemory(creep: Logistics) {
        const memory = creep.memory
        const currentTask = memory.currentTask
        if (currentTask === TASK_COLLECTING && isFullOfEnergy(creep)) {
            memory.currentTask = memory.preference
        } else if (currentTask !== TASK_COLLECTING && hasNoEnergy(creep)) {
            memory.currentTask = TASK_COLLECTING
            memory.waitTime = 0
        }
    },

    build(creep: Logistics) {
        const targets = getConstructionSites(creep.room)
        if (targets.length) {
            if (creep.build(targets[0]) === ERR_NOT_IN_RANGE) {
                creep.moveTo(targets[0], {
                    visualizePathStyle: { stroke: '#ffffff' },
                })
            }
        } else if (isFullOfEnergy(creep)) {
            const buildManager = getBuildManager(creep.room)
            if (buildManager.createConstructionSite()) {
                // wait till next cycle to figure it out
            } else {
                roleLogistics.switchTask(creep)
            }
        }
    },

    repair(creep: Logistics) {
        const structure = findWeakestStructure(creep.room)
        if (structure === null) {
            roleLogistics.switchTask(creep)
            return
        }

        if (creep.repair(structure) === ERR_NOT_IN_RANGE) {
            creep.moveTo(structure.pos, {
                visualizePathStyle: { stroke: '#ffffff' },
            })
        }
    },

    upgrade(creep: Logistics) {
        if (!creep.room.controller) {
            creep.say('???')
            return
        }
        if (
            creep.upgradeController(creep.room.controller) === ERR_NOT_IN_RANGE
        ) {
            creep.moveTo(creep.room.controller, {
                visualizePathStyle: { stroke: '#ffffff' },
            })
        }
    },

    haulEnergy(creep: Logistics) {
        const targets = creep.room.find(FIND_STRUCTURES, {
            filter: roleLogistics.needsEnergy,
        })
        if (targets.length > 0) {
            if (
                creep.transfer(targets[0], RESOURCE_ENERGY) === ERR_NOT_IN_RANGE
            ) {
                creep.moveTo(targets[0], {
                    visualizePathStyle: { stroke: '#ffffff' },
                })
            }
        } else {
            roleLogistics.switchTask(creep)
        }
    },

    switchTask(creep: Logistics) {
        if (!isAtExtensionCap(creep.room)) {
            creep.memory.currentTask = TASK_BUILDING
        } else {
            creep.memory.currentTask = TASK_UPGRADING
        }
        roleLogistics.run(creep)
    },

    needsEnergy(structure: Structure): boolean {
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
    },

    requestedCarryCapacity(spawn: StructureSpawn) {
        const parts = calculateParts(spawn.room.energyCapacityAvailable)
        const carrys = filter(parts, p => p === CARRY)
        return carrys.length * 50
    },

    create(
        spawn: StructureSpawn,
        source: Id<Source>,
        preference: DeliveryTask = TASK_HAULING,
        rescue = false,
    ): number {
        const capacity = rescue ? 300 : spawn.room.energyCapacityAvailable
        return spawn.spawnCreep(
            calculateParts(capacity),
            `${ROLE}:${preference}:${Game.time}`,
            {
                memory: {
                    role: ROLE,
                    source,
                    preference,
                    currentTask: TASK_COLLECTING,
                    waitTime: 0,
                } as LogisticsMemory,
            },
        )
    },
}

export function calculateParts(capacity: number): BodyPartConstant[] {
    let capacityLeft = capacity
    let parts: BodyPartConstant[] = []
    const chunkCost =
        BODYPART_COST[WORK] + BODYPART_COST[CARRY] + 2 * BODYPART_COST[MOVE]
    while (capacityLeft >= chunkCost) {
        parts = parts.concat([WORK, MOVE, CARRY, MOVE])
        capacityLeft -= chunkCost
    }
    return parts
}

export default roleLogistics
