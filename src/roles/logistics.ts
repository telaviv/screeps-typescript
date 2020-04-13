import filter from 'lodash/filter'
import EnergySinkManager from 'managers/energy-sink-manager'
import { getBuildManager } from 'managers/build-manager'
import { getEnergy, isFullOfEnergy, hasNoEnergy } from 'utils/energy-harvesting'
import { wrap } from 'utils/profiling'
import {
    getConstructionSites,
    isAtExtensionCap,
    findWeakestStructure,
} from 'utils/room'
import {
    PREFERENCE_WORKER,
    TASK_HAULING,
    TASK_BUILDING,
    TASK_UPGRADING,
    TASK_REPAIRING,
    TASK_COLLECTING,
    Logistics,
    LogisticsMemory,
    LogisticsPreference,
} from './logistics-constants'

const ROLE = 'logistics'
const SUICIDE_TIME = 200
const SLEEP_SAY_TIME = 50

const roleLogistics = {
    run: wrap((creep: Logistics) => {
        roleLogistics.updateMemory(creep)
        roleLogistics.say(creep)
        if (creep.memory.waitTime > SLEEP_SAY_TIME) {
            creep.say('😴')
        }

        if (creep.memory.waitTime > SUICIDE_TIME) {
            creep.suicide()
        }

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
            if (memory.preference === PREFERENCE_WORKER) {
                roleLogistics.assignWorkerPreference(creep)
            } else {
                memory.currentTask = memory.preference
            }
        } else if (currentTask !== TASK_COLLECTING && hasNoEnergy(creep)) {
            memory.currentTask = TASK_COLLECTING
        }
        memory.waitTime = 0
    },

    assignWorkerPreference(creep: Logistics) {
        const memory = creep.memory
        const buildManager = getBuildManager(creep.room)
        if (!EnergySinkManager.transfersAreFull(creep.room)) {
            memory.currentTask = TASK_HAULING
        } else if (buildManager.canBuildImportant()) {
            memory.currentTask = TASK_BUILDING
        } else if (EnergySinkManager.canRepairNonWalls(creep.room)) {
            memory.currentTask = TASK_REPAIRING
        } else {
            memory.currentTask = TASK_UPGRADING
        }
    },

    say(creep: Logistics) {
        let sayString = ''
        const memory = creep.memory
        if (memory.currentTask === TASK_HAULING) {
            sayString = '🚚'
        } else if (memory.currentTask === TASK_BUILDING) {
            sayString = '🏗️'
        } else if (memory.currentTask === TASK_REPAIRING) {
            sayString = '🛠️'
        } else if (memory.currentTask === TASK_UPGRADING) {
            sayString = '🌃'
        } else if (memory.currentTask === TASK_COLLECTING) {
            sayString = '⚡'
        }
        if (memory.preference === PREFERENCE_WORKER) {
            sayString = `👷 ${sayString}`
        }
        creep.say(sayString)
    },

    build(creep: Logistics) {
        const targets = getConstructionSites(creep.room)
        if (targets.length) {
            if (creep.build(targets[0]) === ERR_NOT_IN_RANGE) {
                creep.moveTo(targets[0], {
                    visualizePathStyle: { stroke: '#ffffff' },
                    range: 3,
                })
            }
        } else if (isFullOfEnergy(creep)) {
            const buildManager = getBuildManager(creep.room)
            if (buildManager.createConstructionSite()) {
                // wait till next cycle to figure it out
            } else {
                roleLogistics.switchTask(creep)
            }
        } else {
            creep.memory.currentTask = TASK_COLLECTING
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
                range: 3,
            })
        }
    },

    haulEnergy(creep: Logistics) {
        const energySinkManager = EnergySinkManager.get()
        const target = energySinkManager.makeTransferRequest(creep)
        if (target === null) {
            roleLogistics.switchTask(creep)
            return
        }
        if (creep.transfer(target, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
            creep.moveTo(target, {
                visualizePathStyle: { stroke: '#ffffff' },
            })
        }
    },

    switchTask(creep: Logistics) {
        if (!isAtExtensionCap(creep.room)) {
            creep.memory.currentTask = TASK_BUILDING
        } else {
            creep.memory.currentTask = TASK_UPGRADING
        }
    },

    requestedCarryCapacity(spawn: StructureSpawn) {
        const parts = calculateParts(spawn.room.energyCapacityAvailable)
        const carrys = filter(parts, p => p === CARRY)
        return carrys.length * 50
    },

    create(
        spawn: StructureSpawn,
        source: Id<Source>,
        preference: LogisticsPreference = TASK_HAULING,
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
