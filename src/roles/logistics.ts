import filter from 'lodash/filter'

import * as Logger from 'utils/logger'
import * as SignTask from 'tasks/sign'
import * as TaskRunner from 'tasks/runner'
import * as TransferTask from 'tasks/transfer'
import {
    LogisticsCreep,
    LogisticsMemory,
    LogisticsPreference,
    NO_TASK,
    PREFERENCE_WORKER,
    TASK_BUILDING,
    TASK_COLLECTING,
    TASK_HAULING,
    TASK_MINING,
    TASK_REPAIRING,
    TASK_UPGRADING,
    TASK_WALL_REPAIRS,
} from './logistics-constants'
import { fromBodyPlan, fromBodyPlanSafe } from 'utils/parts'
import {
    getConstructionSites,
    getOwnWeakestWall,
    hasHostileCreeps,
    hasOwnFragileWall,
} from 'utils/room'
import { hasNoEnergy, isFullOfEnergy } from 'utils/energy-harvesting'
import { mprofile, profile } from 'utils/profiling'
import EnergySinkManager from 'managers/energy-sink-manager'
import { addEnergyTask } from 'tasks/usage-utils'
import { findTaskByType } from 'tasks/utils'
import { getBuildManager } from 'managers/build-manager'
import { getRandomWalkablePosition } from 'utils/room-position'
import { isMiningTask } from 'tasks/mining/utils'
import { spawnCreep } from 'utils/spawn'

const ROLE = 'logistics'
const SUICIDE_TIME = 40
const RESPAWN_IDLE_LIMIT = 0
const SLEEP_SAY_TIME = 10

const TASK_EMOJIS = {
    [TASK_HAULING]: '🚚',
    [TASK_BUILDING]: '🏗️',
    [TASK_REPAIRING]: '🛠️',
    [TASK_COLLECTING]: '⚡',
    [TASK_UPGRADING]: '🌃',
    [TASK_MINING]: '⛏️',
    [TASK_WALL_REPAIRS]: '🧱',
    [NO_TASK]: '🤔',
}

const PREFERENCE_EMOJIS = {
    [TASK_HAULING]: '🚚',
    [TASK_BUILDING]: '🏗️',
    [TASK_REPAIRING]: '🛠️',
    [TASK_COLLECTING]: '⚡',
    [TASK_UPGRADING]: '🌃',
    [TASK_WALL_REPAIRS]: '🧱',
    [PREFERENCE_WORKER]: '👷',
    [NO_TASK]: '🤔',
}

const BODY_PLAN_UNIT = [WORK, CARRY, MOVE, MOVE]

class RoleLogistics {
    private creep: LogisticsCreep

    constructor(creep: LogisticsCreep) {
        this.creep = creep
    }

    @profile
    public run(): void {
        if (this.creep.spawning) {
            return
        }
        if (this.creep.memory.tasks.length > 0 || this.creep.memory.currentTask !== NO_TASK) {
            this.unidle()
        } else {
            this.idle()
        }

        this.say()
        this.updateMemory()
        if (this.idleTime() > SUICIDE_TIME) {
            this.creep.suicide()
            return
        }

        const currentTask = this.creep.memory.currentTask
        const tasks = this.creep.memory.tasks

        if (tasks.length > 0) {
            this.runTask()
        } else if (this.canSign()) {
            SignTask.makeRequest(this.creep)
        } else if (currentTask === TASK_COLLECTING) {
            this.getEnergy()
        } else if (currentTask === TASK_HAULING) {
            this.haulEnergy()
        } else if (currentTask === TASK_BUILDING) {
            this.build()
        } else if (currentTask === TASK_UPGRADING) {
            this.upgrade()
        } else if (currentTask === TASK_REPAIRING) {
            this.repair()
        } else if (currentTask === TASK_WALL_REPAIRS) {
            this.repairWalls()
        } else if (currentTask === NO_TASK) {
            this.wander()
            this.assignWorkerPreference()
        }
    }

    @profile
    private canSign(): boolean {
        const home = Game.rooms[this.creep.memory.home]
        if (home.memory.signed) {
            return false
        }
        const task = findTaskByType('sign')
        return task === undefined
    }

    public static staticRun(creep: LogisticsCreep): void {
        return new RoleLogistics(creep).run()
    }

    @profile
    private getEnergy(): void {
        if (!addEnergyTask(this.creep, { includeMining: true })) {
            this.setToNoTask('no tasks could be made')
        }
    }

    @profile
    private setToNoTask(reason: string): void {
        if (this.creep.memory.tasks.length > 0) {
            Logger.warning('logistics:setToNoTask:failure:hasTasks', this.creep.name, reason)
            return
        }
        this.creep.memory.currentTask = NO_TASK
    }

    @profile
    private updateMemory() {
        const memory = this.creep.memory
        const currentTask = memory.currentTask

        if (currentTask === TASK_COLLECTING && isFullOfEnergy(this.creep)) {
            if (memory.preference === PREFERENCE_WORKER) {
                this.assignWorkerPreference()
            } else {
                memory.currentTask = memory.preference
            }
        } else if (currentTask !== TASK_COLLECTING && hasNoEnergy(this.creep)) {
            memory.currentTask = TASK_COLLECTING
        }
    }

    @profile
    private assignWorkerPreference() {
        const memory = this.creep.memory
        const buildManager = getBuildManager(this.creep.room)
        if (TransferTask.makeRequest(this.creep)) {
            memory.currentTask = TASK_HAULING
        } else if (buildManager && buildManager.canBuildImportant()) {
            memory.currentTask = TASK_BUILDING
        } else if (hasOwnFragileWall(this.creep.room)) {
            memory.currentTask = TASK_WALL_REPAIRS
        } else if (EnergySinkManager.canRepairNonWalls(this.creep.room)) {
            memory.currentTask = TASK_REPAIRING
        } else {
            memory.currentTask = TASK_UPGRADING
        }
    }

    @profile
    say(): void {
        if (this.idleTime() > SLEEP_SAY_TIME) {
            this.creep.say('😴')
            return
        }
        const memory = this.creep.memory
        const preference = PREFERENCE_EMOJIS[memory.preference]
        const currentTask = TASK_EMOJIS[memory.currentTask]
        const tasks = this.creep.memory.tasks
        if (tasks.length > 0 && tasks[0] === undefined) {
            throw new Error(
                `undefined task: ${this.creep.name}: ${JSON.stringify(tasks)} $${tasks.length}`,
            )
        }
        if (tasks.length > 0 && isMiningTask(tasks[0])) {
            this.creep.say(`${preference} ⛏️`)
        } else if (currentTask === NO_TASK) {
            this.creep.say('🤔')
        } else {
            this.creep.say(`${preference} ${currentTask}`)
        }
    }

    private idleTime(): number {
        return Game.time - (this.creep.memory.idleTimestamp || Game.time)
    }

    private idle(): void {
        if (this.creep.memory.idleTimestamp === null) {
            this.creep.memory.idleTimestamp = Game.time
        }
    }

    private unidle(): void {
        this.creep.memory.idleTimestamp = null
    }

    @profile
    build(): void {
        const targets = this.getNonWallSites(this.creep.room)
        const target = this.creep.pos.findClosestByRange(targets)
        if (target) {
            if (this.creep.build(target) === ERR_NOT_IN_RANGE) {
                this.creep.moveTo(target, {
                    visualizePathStyle: { stroke: '#ffffff' },
                    range: 3,
                })
            }
        } else if (isFullOfEnergy(this.creep)) {
            this.assignWorkerPreference()
        } else {
            this.creep.memory.currentTask = TASK_COLLECTING
        }
    }

    @profile
    getNonWallSites(room: Room): ConstructionSite[] {
        return getConstructionSites(room, {
            filter: (site: ConstructionSite) =>
                site.structureType !== STRUCTURE_WALL && site.structureType !== STRUCTURE_RAMPART,
        })
    }

    @profile
    repairWalls(): void {
        let structure = null
        if (this.creep.memory.currentTarget) {
            structure = Game.getObjectById<Structure>(this.creep.memory.currentTarget)
            if (structure === null) {
                Logger.warning(
                    'repair:target:failure',
                    this.creep.name,
                    this.creep.memory.currentTarget,
                )
            }
        }

        if (structure === null) {
            structure = getOwnWeakestWall(this.creep.room)
        }

        if (structure === null || structure.hits === structure.hitsMax) {
            this.assignWorkerPreference()
            return
        }

        this.creep.memory.currentTarget = structure.id

        const err = this.creep.repair(structure)
        if (err === ERR_NOT_IN_RANGE) {
            this.creep.moveTo(structure.pos, {
                visualizePathStyle: { stroke: '#ffffff' },
                range: 3,
            })
        } else if (err !== OK) {
            Logger.warning('logistics:repair-wall:failure', this.creep.name, err)
        }
    }

    @mprofile('logistics:repair')
    repair(): void {
        const structure = EnergySinkManager.findRepairTarget(this.creep)
        if (structure === null) {
            this.assignWorkerPreference()
            return
        }

        const err = this.creep.repair(structure)
        if (err === ERR_NOT_IN_RANGE) {
            this.creep.moveTo(structure.pos, {
                visualizePathStyle: { stroke: '#ffffff' },
                range: 3,
            })
        } else if (err !== OK) {
            Logger.warning('logistics:repair:failure', this.creep.name, err)
        }
    }

    @mprofile('logistics:upgrade')
    upgrade(): void {
        const home = Game.rooms[this.creep.memory.home]
        if (!home.controller) {
            this.creep.say('???')
            return
        }
        if (this.creep.upgradeController(home.controller) === ERR_NOT_IN_RANGE) {
            this.creep.moveTo(home.controller, {
                visualizePathStyle: { stroke: '#ffffff' },
                range: 3,
            })
        }
    }

    @mprofile('logistics:haulEnergy')
    haulEnergy(): void {
        if (TransferTask.makeRequest(this.creep)) {
            this.runTask()
        } else if (hasHostileCreeps(this.creep.room)) {
            this.creep.memory.currentTask = TASK_REPAIRING
        } else {
            this.assignWorkerPreference()
        }
    }

    @profile
    private wander(): void {
        const pos = getRandomWalkablePosition(this.creep.pos)
        if (pos !== null) {
            this.creep.moveTo(pos)
        }
    }

    @profile
    private runTask(): void {
        const task = this.creep.memory.tasks[0]
        TaskRunner.run(task, this.creep)
    }

    static requestedCarryCapacity(spawn: StructureSpawn): number {
        const parts = calculateParts(spawn.room.energyCapacityAvailable)
        const carrys = filter(parts, (p: BodyPartConstant) => p === CARRY)
        return carrys.length * 50
    }

    @profile
    public static createCreep(
        spawn: StructureSpawn,
        preference: LogisticsPreference = TASK_HAULING,
        rescue = false,
    ): ScreepsReturnCode {
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
    }

    @profile
    public static canCreateCreep(capacity: number): boolean {
        return fromBodyPlanSafe(capacity, BODY_PLAN_UNIT) !== null
    }

    @profile
    public static shouldCreateCreep(spawn: StructureSpawn): boolean {
        const logistics = filter(Object.keys(Memory.creeps), (creepName: string) => {
            const creep = Game.creeps[creepName] as LogisticsCreep
            return creep && creep.memory.role === 'logistics' && creep.room.name === spawn.room.name
        }).map((creepName: string) => new RoleLogistics(Game.creeps[creepName] as LogisticsCreep))

        const maxIdleTime = logistics.reduce((max: number, role: RoleLogistics) => {
            return Math.max(max, role.idleTime())
        }, 0)
        const canCreateCreep = RoleLogistics.canCreateCreep(spawn.room.energyAvailable)
        const retVal =
            RoleLogistics.canCreateCreep(spawn.room.energyAvailable) &&
            maxIdleTime <= RESPAWN_IDLE_LIMIT
        Logger.debug(
            'logistics:shouldCreateCreep',
            JSON.stringify(
                logistics.map((role: RoleLogistics) => ({
                    name: role.creep.name,
                    idleTime: role.idleTime(),
                })),
            ),
            maxIdleTime,
            spawn.room.energyAvailable,
            canCreateCreep,
            retVal,
        )
        return retVal
    }
}

/**
 * Checks if a creep can spawn with the given energy capacity
 * @param capacity total energy capacity
 * @returns true if the creep can be spawned.
 */
export function calculateParts(capacity: number): BodyPartConstant[] {
    const fixed = [...BODY_PLAN_UNIT, ...BODY_PLAN_UNIT, ...BODY_PLAN_UNIT]
    const fixedCost = fixed.reduce((total, p) => total + BODYPART_COST[p], 0)
    let plan: BodyPartConstant[]
    if (fixedCost > capacity) {
        plan = fromBodyPlan(capacity, BODY_PLAN_UNIT)
    } else {
        plan = fromBodyPlan(capacity, [MOVE, CARRY], fixed, 4)
    }
    Logger.debug('logistics:calculateParts', JSON.stringify(plan), capacity)
    return plan
}

export default RoleLogistics
