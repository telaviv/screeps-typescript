import filter from 'lodash/filter'
import EnergySinkManager from 'managers/energy-sink-manager'
import { getBuildManager } from 'managers/build-manager'
import { getEnergy, isFullOfEnergy, hasNoEnergy } from 'utils/energy-harvesting'
import { wrap } from 'utils/profiling'
import {
    getConstructionSites,
    isAtExtensionCap,
    hasFragileWall,
    getWeakestWall,
    findLongDistanceBuild,
    needsLongDistanceBuild,
} from 'utils/room'
import { spawnCreep } from 'utils/spawn'
import * as Logger from 'utils/logger'
import {
    PREFERENCE_WORKER,
    TASK_HAULING,
    TASK_BUILDING,
    TASK_UPGRADING,
    TASK_REPAIRING,
    TASK_COLLECTING,
    TASK_WALL_REPAIRS,
    TASK_LONG_DISTANCE_BUILD,
    Logistics,
    LogisticsMemory,
    LogisticsPreference,
} from './logistics-constants'

const ROLE = 'logistics'
const SUICIDE_TIME = 200
const SLEEP_SAY_TIME = 50

const TASK_EMOJIS = {
    [TASK_HAULING]: '🚚',
    [TASK_BUILDING]: '🏗️',
    [TASK_REPAIRING]: '🛠️',
    [TASK_COLLECTING]: '⚡',
    [TASK_UPGRADING]: '🌃',
    [TASK_LONG_DISTANCE_BUILD]: '🚄',
    [TASK_WALL_REPAIRS]: '🧱',
}

const PREFERENCE_EMOJIS = {
    [TASK_HAULING]: '🚚',
    [TASK_BUILDING]: '🏗️',
    [TASK_REPAIRING]: '🛠️',
    [TASK_COLLECTING]: '⚡',
    [TASK_UPGRADING]: '🌃',
    [TASK_WALL_REPAIRS]: '🧱',
    [TASK_LONG_DISTANCE_BUILD]: '🚄',
    [PREFERENCE_WORKER]: '👷',
}

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
        } else if (currentTask === TASK_LONG_DISTANCE_BUILD) {
            roleLogistics.longDistanceBuild(creep)
        } else if (currentTask === TASK_BUILDING) {
            roleLogistics.build(creep)
        } else if (currentTask === TASK_UPGRADING) {
            roleLogistics.upgrade(creep)
        } else if (currentTask === TASK_REPAIRING) {
            roleLogistics.repair(creep)
        } else if (currentTask === TASK_WALL_REPAIRS) {
            roleLogistics.repairWalls(creep)
        }
    }, 'runLogistics'),

    updateMemory: wrap((creep: Logistics) => {
        const memory = creep.memory
        const currentTask = memory.currentTask

        if (currentTask === TASK_COLLECTING && isFullOfEnergy(creep)) {
            if (memory.preference === PREFERENCE_WORKER) {
                roleLogistics.assignWorkerPreference(creep)
            } else {
                memory.currentTask = memory.preference
            }
            memory.waitTime = 0
        } else if (currentTask !== TASK_COLLECTING && hasNoEnergy(creep)) {
            memory.currentTask = TASK_COLLECTING
            memory.waitTime = 0
            delete memory.currentTarget
        }
    }, 'logistics:updateMemory'),

    assignWorkerPreference(creep: Logistics) {
        const memory = creep.memory
        const buildManager = getBuildManager(creep.room)
        if (!EnergySinkManager.transfersAreFull(creep.room)) {
            memory.currentTask = TASK_HAULING
        } else if (needsLongDistanceBuild(creep.memory.home)) {
            memory.currentTask = TASK_LONG_DISTANCE_BUILD
        } else if (hasFragileWall(creep.room)) {
            memory.currentTask = TASK_WALL_REPAIRS
        } else if (buildManager.canBuildImportant()) {
            memory.currentTask = TASK_BUILDING
        } else if (EnergySinkManager.canRepairNonWalls(creep.room)) {
            memory.currentTask = TASK_REPAIRING
        } else {
            memory.currentTask = TASK_UPGRADING
        }
    },

    say(creep: Logistics) {
        const memory = creep.memory
        const preference = PREFERENCE_EMOJIS[memory.preference]
        const currentTask = TASK_EMOJIS[memory.currentTask]
        creep.say(`${preference} ${currentTask}`)
    },

    build: wrap((creep: Logistics) => {
        const targets = getConstructionSites(creep.room)
        if (targets.length) {
            if (creep.build(targets[0]) === ERR_NOT_IN_RANGE) {
                creep.moveTo(targets[0], {
                    visualizePathStyle: { stroke: '#ffffff' },
                    range: 3,
                })
            }
        } else if (isFullOfEnergy(creep)) {
            roleLogistics.switchTask(creep)
        } else {
            creep.memory.currentTask = TASK_COLLECTING
        }
    }, 'logistics:build'),

    longDistanceBuild: wrap((creep: Logistics) => {
        const site = findLongDistanceBuild(creep.memory.home)
        if (site === null) {
            roleLogistics.switchTask(creep)
            return
        }

        const err = creep.build(site)
        if (err === ERR_NOT_IN_RANGE) {
            creep.moveTo(site, {
                visualizePathStyle: { stroke: '#ffffff' },
                range: 3,
            })
        }
    }, 'logistics:longDistanceBuild'),

    repairWalls: wrap((creep: Logistics) => {
        let structure = null
        if (creep.memory.currentTarget) {
            structure = Game.getObjectById<Structure>(
                creep.memory.currentTarget,
            )
            if (structure === null) {
                Logger.warning(
                    'repair:target:failure',
                    creep.name,
                    creep.memory.currentTarget,
                )
            }
        }

        if (structure === null) {
            structure = getWeakestWall(creep.room)
        }

        if (structure === null || structure.hits === structure.hitsMax) {
            roleLogistics.switchTask(creep)
            return
        }

        creep.memory.currentTarget = structure.id

        const err = creep.repair(structure)
        if (err === ERR_NOT_IN_RANGE) {
            creep.moveTo(structure.pos, {
                visualizePathStyle: { stroke: '#ffffff' },
                range: 3,
            })
        } else if (err !== OK) {
            Logger.warning('logistics:repair-wall:failure', creep.name, err)
        }
    }, 'logistics:repairWalls'),

    repair: wrap((creep: Logistics) => {
        const structure = EnergySinkManager.findRepairTarget(creep)
        if (structure === null) {
            roleLogistics.switchTask(creep)
            return
        }

        const err = creep.repair(structure)
        if (err === ERR_NOT_IN_RANGE) {
            creep.moveTo(structure.pos, {
                visualizePathStyle: { stroke: '#ffffff' },
                range: 3,
            })
        } else if (err !== OK) {
            Logger.warning('logistics:repair:failure', creep.name, err)
        }
    }, 'logistics:repair'),

    upgrade: wrap((creep: Logistics) => {
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
    }, 'logistics:upgrade'),

    haulEnergy: wrap((creep: Logistics) => {
        const energySinkManager = EnergySinkManager.get()
        const target = energySinkManager.makeTransferRequest(creep)
        if (target === null) {
            roleLogistics.switchTask(creep)
            return
        }

        const err = creep.transfer(target, RESOURCE_ENERGY)
        if (err === ERR_NOT_IN_RANGE) {
            creep.moveTo(target, {
                visualizePathStyle: { stroke: '#ffffff' },
            })
        } else if (err === OK) {
            energySinkManager.completeTransferRequest(creep)
        } else {
            Logger.warning('logistics:haul:failure', creep.name, err)
        }
    }, 'logistics:haulEnergy'),

    switchTask(creep: Logistics) {
        let task = creep.memory.currentTask
        if (needsLongDistanceBuild(creep.memory.home)) {
            task = TASK_LONG_DISTANCE_BUILD
        } else if (!isAtExtensionCap(creep.room)) {
            task = TASK_BUILDING
        } else if (hasFragileWall(creep.room)) {
            task = TASK_WALL_REPAIRS
        } else if (EnergySinkManager.canRepairNonWalls(creep.room)) {
            task = TASK_REPAIRING
        } else {
            task = TASK_UPGRADING
        }
        Logger.info(
            'logistics:switch-task',
            creep.name,
            `${creep.memory.currentTask}->${task}`,
        )
        if (creep.memory.currentTask === task) {
            Logger.warning(
                'logistics:switch-task:failure',
                creep.name,
                "couldn't switch from",
                task,
            )
        }
        creep.memory.currentTask = task
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
        const capacity = rescue
            ? Math.max(300, spawn.room.energyAvailable)
            : spawn.room.energyCapacityAvailable
        return spawnCreep(
            spawn,
            calculateParts(capacity),
            `${ROLE}:${preference}:${Game.time}`,
            {
                memory: {
                    role: ROLE,
                    home: spawn.room.name,
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
    const partUnit = [WORK, MOVE, CARRY, MOVE]
    const unitCost = partUnit.reduce((total, p) => total + BODYPART_COST[p], 0)
    let capacityLeft = capacity
    let partsLeft = 50
    let parts: BodyPartConstant[] = []
    while (capacityLeft >= unitCost && partsLeft >= partUnit.length) {
        parts = parts.concat(partUnit)
        capacityLeft -= unitCost
        partsLeft -= partUnit.length
    }
    return parts
}

export default roleLogistics
