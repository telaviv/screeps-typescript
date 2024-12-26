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
    TASK_STORE,
    TASK_TRAVELING,
    TASK_UPGRADING,
    TASK_WALL_REPAIRS,
} from './logistics-constants'
import { fromBodyPlan, fromBodyPlanSafe } from 'utils/parts'
import {
    getConstructionSites,
    getOwnWeakestWall,
    hasHostileCreeps,
    hasNoSpawns,
    hasOwnFragileWall,
    isFragileWall,
} from 'utils/room'
import { hasNoEnergy, isFullOfEnergy } from 'utils/energy-harvesting'
import { moveToRoom, moveWithinRoom } from 'utils/travel'
import { mprofile, profile } from 'utils/profiling'
import EnergySinkManager from 'managers/energy-sink-manager'
import RoomQuery from 'spawn/room-query'
import { addEnergyTask } from 'tasks/usage-utils'
import { findTaskByType } from 'tasks/utils'
import { getBuildManager } from 'managers/build-manager'
import { isMiningTask } from 'tasks/mining/utils'
import { spawnCreep } from 'utils/spawn'
import { wander } from 'utils/creep'

export const ROLE = 'logistics'
const SUICIDE_TIME = 40
const RESPAWN_IDLE_LIMIT = 0
const SLEEP_SAY_TIME = 10
const MAX_TICKS_TO_DOWNGRADE = 5000

const TASK_EMOJIS = {
    [TASK_HAULING]: '🚚',
    [TASK_BUILDING]: '🏗️',
    [TASK_REPAIRING]: '🛠️',
    [TASK_COLLECTING]: '⚡',
    [TASK_UPGRADING]: '🌃',
    [TASK_MINING]: '⛏️',
    [TASK_STORE]: '🏪',
    [TASK_WALL_REPAIRS]: '🧱',
    [TASK_TRAVELING]: '🚎',
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
}

const BODY_PLAN_UNIT = [WORK, CARRY, MOVE, MOVE]

interface CreateOpts {
    home?: string
    rescue?: boolean
    capacity?: number
    noSuicide?: boolean
    noRepairLimit?: boolean
}

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
        if (
            !this.creep.memory.noSuicide &&
            this.idleTime() > SUICIDE_TIME &&
            this.creep.memory.preference === PREFERENCE_WORKER
        ) {
            this.creep.suicide()
            return
        }

        const currentTask = this.creep.memory.currentTask
        const tasks = this.creep.memory.tasks

        if (tasks.length > 0) {
            this.runTask()
            return
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
        } else if (currentTask === TASK_TRAVELING) {
            this.travel()
        } else if (currentTask === NO_TASK) {
            this.assignWorkerPreference()
        }
        if (tasks.length > 0) {
            this.runTask()
            return
        }
    }

    @profile
    private canSign(): boolean {
        const home = Game.rooms[this.creep.memory.home]
        if (!home || home.memory.signed) {
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
        const energyTask = addEnergyTask(this.creep, { includeMining: true })
        if (!energyTask) {
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
        const rq = new RoomQuery(this.creep.room)

        if (
            currentTask === TASK_COLLECTING &&
            (isFullOfEnergy(this.creep) || (this.creep.ticksToLive ?? 0) < 50)
        ) {
            if (
                !rq.getCreepCount('energy-hauler') &&
                this.creep.room.energyAvailable < this.creep.room.energyCapacityAvailable
            ) {
                memory.currentTask = TASK_HAULING
            } else if (
                this.creep.room.controller &&
                this.creep.room.controller.ticksToDowngrade < MAX_TICKS_TO_DOWNGRADE
            ) {
                memory.currentTask = TASK_UPGRADING
            } else if (memory.preference === PREFERENCE_WORKER) {
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
        this.creep.memory.currentTarget = undefined
        const memory = this.creep.memory
        const buildManager = getBuildManager(this.creep.room)
        const rq = new RoomQuery(this.creep.room)
        const hasSafeMode = this.creep.room.controller?.safeMode;

        if (this.creep.room.name !== memory.home) {
            memory.currentTask = TASK_TRAVELING
        } else if (
            this.creep.room.controller &&
            this.creep.room.controller.ticksToDowngrade < MAX_TICKS_TO_DOWNGRADE
        ) {
            memory.currentTask = TASK_UPGRADING
            return
        } else if (hasNoSpawns(this.creep.room)) {
            memory.currentTask = TASK_BUILDING
        } else if (!rq.getCreepCount('energy-hauler') && TransferTask.makeRequest(this.creep)) {
            memory.currentTask = TASK_HAULING
        } else if (!hasSafeMode && hasOwnFragileWall(this.creep.room)) {
            memory.currentTask = TASK_WALL_REPAIRS
        } else if (buildManager && buildManager.hasNonWallConstructionSites()) {
            memory.currentTask = TASK_BUILDING
        } else if (hasSafeMode && hasOwnFragileWall(this.creep.room)) {
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
            this.wander()
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
            this.wander()
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
    private build(): void {
        const targets = this.getNonWallSites(this.creep.room)
        const target = this.creep.pos.findClosestByRange(targets)
        if (target) {
            if (this.creep.build(target) === ERR_NOT_IN_RANGE) {
                moveWithinRoom(this.creep, { pos: target.pos, range: 3 })
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
        const buildManager = getBuildManager(this.creep.room)
        if (
            buildManager &&
            buildManager.hasNonWallConstructionSites() &&
            this.creep.memory.preference !== TASK_WALL_REPAIRS
        ) {
            this.creep.memory.currentTask = TASK_BUILDING
            return
        }

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

        if (structure === null || !isFragileWall(structure)) {
            this.assignWorkerPreference()
            return
        }

        this.creep.memory.currentTarget = structure.id

        const err = this.creep.repair(structure)
        if (err === ERR_NOT_IN_RANGE) {
            moveWithinRoom(
                this.creep,
                { pos: structure.pos, range: 3 },
                { visualizePathStyle: { stroke: '#ffffff' } },
            )
        } else if (err !== OK) {
            Logger.warning('logistics:repair-wall:failure', this.creep.name, err)
        }
    }

    @mprofile('logistics:repair')
    repair(): void {
        const repairThreshold = this.creep.memory.noRepairLimit ? 1 : undefined
        const structure = EnergySinkManager.findRepairTarget(this.creep, repairThreshold)
        if (structure === null) {
            this.assignWorkerPreference()
            return
        }

        const err = this.creep.repair(structure)
        if (err === ERR_NOT_IN_RANGE) {
            moveWithinRoom(
                this.creep,
                { pos: structure.pos, range: 3 },
                { visualizePathStyle: { stroke: '#ffffff' } },
            )
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

        const buildManager = getBuildManager(this.creep.room)
        if (
            buildManager &&
            buildManager.hasNonWallConstructionSites() &&
            home.controller.ticksToDowngrade >= MAX_TICKS_TO_DOWNGRADE &&
            this.creep.memory.preference !== TASK_UPGRADING
        ) {
            this.creep.memory.currentTask = TASK_BUILDING
            return
        }

        const result = this.creep.upgradeController(home.controller)
        if (result === ERR_NOT_IN_RANGE) {
            moveWithinRoom(
                this.creep,
                { pos: home.controller.pos, range: 3 },
                { visualizePathStyle: { stroke: '#ffffff' } },
            )
        }
    }

    @mprofile('logistics:haulEnergy')
    haulEnergy(): void {
        if (
            !this.creep.memory.noSuicide &&
            (this.creep.ticksToLive ?? Infinity) < 50 &&
            hasNoEnergy(this.creep) &&
            this.creep.memory.preference === PREFERENCE_WORKER
        ) {
            this.creep.suicide()
        }
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
        wander(this.creep)
    }

    @profile
    travel(): void {
        if (
            this.creep.room.name === this.creep.memory.home &&
            this.creep.pos.inRangeTo(25, 25, 23)
        ) {
            this.assignWorkerPreference()
            return
        }
        const err = moveToRoom(this.creep, this.creep.memory.home)
        if (err !== OK) {
            Logger.warning(
                'logistics:travel:moveToRoom:failure',
                this.creep.name,
                this.creep.memory.home,
                err,
            )
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
        opts: CreateOpts = { rescue: false, noRepairLimit: false },
    ): ScreepsReturnCode {
        let capacity = opts.rescue
            ? Math.max(300, spawn.room.energyAvailable)
            : spawn.room.energyAvailable
        if (opts.capacity) {
            capacity = opts.capacity
        }
        return spawnCreep(
            spawn,
            calculateParts(capacity),
            `${ROLE}:${preference}`,
            spawn.room.name,
            {
                memory: {
                    role: ROLE,
                    home: opts.home ?? spawn.room.name,
                    preference,
                    currentTask: TASK_COLLECTING,
                    currentTarget: undefined,
                    noSuicide: opts.noSuicide ?? false,
                    noRepairLimit: opts.noRepairLimit ?? false,
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
    public static shouldCreateCreep(spawn: StructureSpawn, capacity?: number): boolean {
        capacity = capacity ?? spawn.room.energyAvailable
        const logistics = filter(Object.keys(Memory.creeps), (creepName: string) => {
            const creep = Game.creeps[creepName] as LogisticsCreep
            return creep && creep.memory.role === 'logistics' && creep.room.name === spawn.room.name
        }).map((creepName: string) => new RoleLogistics(Game.creeps[creepName] as LogisticsCreep))

        const maxIdleTime = logistics.reduce((max: number, role: RoleLogistics) => {
            return Math.max(max, role.idleTime())
        }, 0)
        const canCreateCreep = RoleLogistics.canCreateCreep(capacity)
        const retVal = RoleLogistics.canCreateCreep(capacity) && maxIdleTime <= RESPAWN_IDLE_LIMIT
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
    return fromBodyPlan(capacity, BODY_PLAN_UNIT)
}

export default RoleLogistics
