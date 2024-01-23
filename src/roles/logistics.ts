import filter from 'lodash/filter'
import EnergySinkManager from 'managers/energy-sink-manager'
import { getBuildManager } from 'managers/build-manager'
import { isAtEdge, moveToRoom, moveTowardsCenter } from 'utils/creep'
import { getEnergy, hasNoEnergy, isFullOfEnergy } from 'utils/energy-harvesting'
import { fromBodyPlan, fromBodyPlanSafe } from 'utils/parts'
import { wrap } from 'utils/profiling'
import {
    getConstructionSites,
    getOwnWeakestWall,
    hasOwnFragileWall,
    hasTunnelSite,
    isAtExtensionCap,
} from 'utils/room'
import { spawnCreep } from 'utils/spawn'
import * as Logger from 'utils/logger'
import * as TaskRunner from 'tasks/runner'
import * as TransferTask from 'tasks/transfer'
import {
    LogisticsCreep,
    LogisticsMemory,
    LogisticsPreference,
    PREFERENCE_WORKER,
    TASK_BUILDING,
    TASK_COLLECTING,
    TASK_HAULING,
    TASK_REPAIRING,
    TASK_UPGRADING,
    TASK_WALL_REPAIRS,
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
    [TASK_WALL_REPAIRS]: '🧱',
}

const PREFERENCE_EMOJIS = {
    [TASK_HAULING]: '🚚',
    [TASK_BUILDING]: '🏗️',
    [TASK_REPAIRING]: '🛠️',
    [TASK_COLLECTING]: '⚡',
    [TASK_UPGRADING]: '🌃',
    [TASK_WALL_REPAIRS]: '🧱',
    [PREFERENCE_WORKER]: '👷',
}

const BODY_PLAN_UNIT = [WORK, CARRY, MOVE, MOVE]

const roleLogistics = {
    run: wrap((creep: LogisticsCreep) => {
        // remove this
        if (!creep.memory.tasks) {
            creep.memory.tasks = []
        }

        roleLogistics.updateMemory(creep)
        roleLogistics.say(creep)
        if (roleLogistics.idleTime(creep) > SLEEP_SAY_TIME) {
            creep.say('😴')
        }

        if (roleLogistics.idleTime(creep) > SUICIDE_TIME) {
            creep.suicide()
            return
        }

        if (creep.room.name !== creep.memory.home) {
            moveToRoom(creep.memory.home, creep)
            return
        }

        if (isAtEdge(creep)) {
            moveTowardsCenter(creep)
            return
        }

        const currentTask = creep.memory.currentTask

        if (creep.memory.tasks.length > 0) {
            roleLogistics.runTask(creep)
        } else if (currentTask === TASK_COLLECTING) {
            getEnergy(creep)
        } else if (currentTask === TASK_HAULING) {
            roleLogistics.haulEnergy(creep)
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

    updateMemory: wrap((creep: LogisticsCreep) => {
        const memory = creep.memory
        const currentTask = memory.currentTask

        if (currentTask === TASK_COLLECTING && isFullOfEnergy(creep)) {
            if (memory.preference === PREFERENCE_WORKER) {
                roleLogistics.assignWorkerPreference(creep)
            } else {
                memory.currentTask = memory.preference
            }
            memory.idleTimestamp = null
        } else if (currentTask !== TASK_COLLECTING && hasNoEnergy(creep)) {
            memory.currentTask = TASK_COLLECTING
            memory.idleTimestamp = null
            delete memory.currentTarget
        }
    }, 'logistics:updateMemory'),

    assignWorkerPreference(creep: LogisticsCreep) {
        const memory = creep.memory
        const buildManager = getBuildManager(creep.room)
        if (TransferTask.makeRequest(creep)) {
            memory.currentTask = TASK_HAULING
        } else if (buildManager.canBuildImportant()) {
            memory.currentTask = TASK_BUILDING
        } else if (hasOwnFragileWall(creep.room)) {
            memory.currentTask = TASK_WALL_REPAIRS
        } else if (EnergySinkManager.canRepairNonWalls(creep.room)) {
            memory.currentTask = TASK_REPAIRING
        } else {
            memory.currentTask = TASK_UPGRADING
        }
    },

    say(creep: LogisticsCreep) {
        const memory = creep.memory
        const preference = PREFERENCE_EMOJIS[memory.preference]
        const currentTask = TASK_EMOJIS[memory.currentTask]
        creep.say(`${preference} ${currentTask}`)
    },

    idleTime(creep: LogisticsCreep): number {
        return Game.time - (creep.memory.idleTimestamp || Game.time)
    },

    unidle(creep: ResourceCreep) {
        creep.memory.idleTimestamp = null;
    },

    build: wrap((creep: LogisticsCreep) => {
        const targets = roleLogistics.getNonWallSites(creep.room)
        const target = creep.pos.findClosestByRange(targets)
        if (target) {
            if (creep.build(target) === ERR_NOT_IN_RANGE) {
                creep.moveTo(target, {
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

    getNonWallSites: (room: Room) => {
        return getConstructionSites(room, {
            filter: (site: ConstructionSite) =>
                site.structureType !== STRUCTURE_WALL &&
                site.structureType !== STRUCTURE_RAMPART,
        })
    },

    repairWalls: wrap((creep: LogisticsCreep) => {
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
            structure = getOwnWeakestWall(creep.room)
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

    repair: wrap((creep: LogisticsCreep) => {
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

    upgrade: wrap((creep: LogisticsCreep) => {
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

    haulEnergy: wrap((creep: LogisticsCreep) => {
        if (TransferTask.makeRequest(creep)) {
            roleLogistics.runTask(creep)
        } else {
            roleLogistics.switchTask(creep)
        }
    }, 'logistics:haulEnergy'),

    runTask(creep: LogisticsCreep) {
        const task = creep.memory.tasks[0]
        TaskRunner.run(task, creep)
    },

    switchTask(creep: LogisticsCreep) {
        let task = creep.memory.currentTask
        if (!isAtExtensionCap(creep.room) || hasTunnelSite(creep.room)) {
            task = TASK_BUILDING
        } else if (hasOwnFragileWall(creep.room)) {
            task = TASK_WALL_REPAIRS
        } else if (EnergySinkManager.canRepairNonWalls(creep.room)) {
            task = TASK_REPAIRING
        } else {
            task = TASK_UPGRADING
        }
        if (creep.memory.currentTask === task) {
            Logger.info(
                'logistics:switch-task:failure',
                creep.name,
                "couldn't switch from",
                task,
                '(',
                isAtExtensionCap(creep.room),
                ',',
                hasTunnelSite(creep.room),
                ')',
            )
        }
        creep.memory.currentTask = task
    },

    requestedCarryCapacity(spawn: StructureSpawn) {
        const parts = calculateParts(spawn.room.energyCapacityAvailable)
        const carrys = filter(parts, (p: BodyPartConstant) => p === CARRY)
        return carrys.length * 50
    },

    create(
        spawn: StructureSpawn,
        preference: LogisticsPreference = TASK_HAULING,
        rescue = false,
    ): number {
        const capacity = rescue
            ? Math.max(300, spawn.room.energyAvailable)
            : spawn.room.energyAvailable
        return spawnCreep(
            spawn,
            calculateParts(capacity),
            `${ROLE}:${preference}`,
            spawn.room.name,
            {
                memory: {
                    role: ROLE,
                    home: spawn.room.name,
                    preference,
                    currentTask: TASK_COLLECTING,
                    currentTarget: undefined,
                    idleTimestamp: null,
                    tasks: [],
                } as LogisticsMemory,
            },
        )
    },

    canCreate(capacity: number): boolean {
        return fromBodyPlanSafe(capacity, BODY_PLAN_UNIT) !== null
    },
}

/**
 * Checks if a creep can spawn with the given energy capacity
 * @param capacity total energy capacity
 * @returns true if the creep can be spawned.
 */
export function calculateParts(capacity: number): BodyPartConstant[] {
    const plan = fromBodyPlan(capacity, BODY_PLAN_UNIT)
    Logger.debug('logistics:calculateParts', JSON.stringify(plan), capacity)
    return plan
}

export default roleLogistics
