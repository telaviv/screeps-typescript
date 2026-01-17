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
/** Ticks of idle time before a worker logistics creep suicides */
const SUICIDE_TIME = 40
/** Maximum idle time before preventing new creep spawns */
const RESPAWN_IDLE_LIMIT = 0
/** Ticks idle before showing sleep emoji */
const SLEEP_SAY_TIME = 10
/** Controller downgrade threshold that triggers upgrading priority */
const MAX_TICKS_TO_DOWNGRADE = 5000

/** Emoji display for each task type */
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

/** Emoji display for each preference type */
const PREFERENCE_EMOJIS = {
    [TASK_HAULING]: '🚚',
    [TASK_BUILDING]: '🏗️',
    [TASK_REPAIRING]: '🛠️',
    [TASK_COLLECTING]: '⚡',
    [TASK_UPGRADING]: '🌃',
    [TASK_WALL_REPAIRS]: '🧱',
    [PREFERENCE_WORKER]: '👷',
}

/** Base body unit for logistics creeps: 1 WORK, 1 CARRY, 2 MOVE */
const BODY_PLAN_UNIT = [WORK, CARRY, MOVE, MOVE]

/** Options for creating a logistics creep */
interface CreateOpts {
    home?: string
    rescue?: boolean
    capacity?: number
    noSuicide?: boolean
    noRepairLimit?: boolean
}

/**
 * General-purpose worker creep that dynamically switches between tasks.
 * Tasks include collecting, hauling, building, upgrading, repairing, and wall repairs.
 */
class RoleLogistics {
    private creep: LogisticsCreep

    constructor(creep: LogisticsCreep) {
        this.creep = creep
    }

    /**
     * Main logistics behavior loop.
     * Manages task switching, idle detection, and task execution.
     */
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

    /** Checks if the creep can sign the controller */
    @profile
    private canSign(): boolean {
        const home = Game.rooms[this.creep.memory.home]
        if (!home || home.memory.signed) {
            return false
        }
        const task = findTaskByType('sign')
        return task === undefined
    }

    /**
     * Static entry point for running logistics creep behavior.
     * @param creep - The logistics creep to run
     */
    public static staticRun(creep: LogisticsCreep): void {
        return new RoleLogistics(creep).run()
    }

    /** Attempts to find and collect energy from available sources */
    @profile
    private getEnergy(): void {
        const energyTask = addEnergyTask(this.creep, { includeMining: true })
        if (!energyTask) {
            this.setToNoTask('no tasks could be made')
        }
    }

    /**
     * Sets the creep to idle state with no task.
     * @param reason - Debug reason for the state change
     */
    @profile
    private setToNoTask(reason: string): void {
        if (this.creep.memory.tasks.length > 0) {
            Logger.warning('logistics:setToNoTask:failure:hasTasks', this.creep.name, reason)
            return
        }
        this.creep.memory.currentTask = NO_TASK
    }

    /** Updates task state based on energy levels and room conditions */
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

    /** Assigns the next task based on room priorities for worker-preference creeps */
    @profile
    private assignWorkerPreference() {
        this.creep.memory.currentTarget = undefined
        const memory = this.creep.memory
        const buildManager = getBuildManager(this.creep.room)
        const rq = new RoomQuery(this.creep.room)
        const hasSafeMode = this.creep.room.controller?.safeMode

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

    /** Displays emoji indicating current preference and task */
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

    /** Returns ticks the creep has been idle */
    private idleTime(): number {
        return Game.time - (this.creep.memory.idleTimestamp || Game.time)
    }

    /** Marks the creep as idle, recording the timestamp */
    private idle(): void {
        if (this.creep.memory.idleTimestamp === null) {
            this.creep.memory.idleTimestamp = Game.time
        }
    }

    /** Clears the idle timestamp */
    private unidle(): void {
        this.creep.memory.idleTimestamp = null
    }

    /** Builds construction sites (non-wall/rampart) */
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

    /**
     * Gets construction sites excluding walls and ramparts.
     * @param room - The room to search
     */
    @profile
    getNonWallSites(room: Room): ConstructionSite[] {
        return getConstructionSites(room, {
            filter: (site: ConstructionSite) =>
                site.structureType !== STRUCTURE_WALL && site.structureType !== STRUCTURE_RAMPART,
        })
    }

    /** Repairs fragile walls and ramparts */
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
            // Only clear target if structure doesn't exist or is fully repaired
            // Continue repairing even if it's no longer "fragile" until we run out of energy
            if (structure === null || structure.hits === structure.hitsMax) {
                Logger.warning(
                    'repair:target:complete',
                    this.creep.name,
                    this.creep.memory.currentTarget,
                )
                this.creep.memory.currentTarget = undefined
                structure = null
            }
        }

        if (structure === null) {
            structure = this.creep.pos.findClosestByRange(
                this.creep.room.find(FIND_STRUCTURES, { filter: (s) => isFragileWall(s) }),
            )
            if (structure === null) {
                // No fragile walls exist, reassign worker
                this.assignWorkerPreference()
                return
            }
            this.creep.memory.currentTarget = structure.id
        }

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

    /** Repairs damaged non-wall structures */
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

    /** Upgrades the room controller */
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

    /** Transfers energy to spawns, extensions, and towers */
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

    /** Moves randomly when idle */
    @profile
    private wander(): void {
        wander(this.creep)
    }

    /** Travels back to home room */
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
        if (!(err === OK || err === ERR_TIRED)) {
            Logger.warning(
                'logistics:travel:moveToRoom:failure',
                this.creep.name,
                this.creep.memory.home,
                err,
            )
        }
    }

    /** Executes the current queued task */
    @profile
    private runTask(): void {
        const task = this.creep.memory.tasks[0]
        TaskRunner.run(task, this.creep)
    }

    /**
     * Calculates carry capacity for a logistics creep at spawn's energy capacity.
     * @param spawn - The spawn to calculate for
     */
    static requestedCarryCapacity(spawn: StructureSpawn): number {
        const parts = calculateParts(spawn.room.energyCapacityAvailable)
        const carrys = filter(parts, (p: BodyPartConstant) => p === CARRY)
        return carrys.length * 50
    }

    /**
     * Creates a logistics creep with the specified preference.
     * @param spawn - The spawn to create from
     * @param preference - The task preference for the creep
     * @param opts - Creation options
     */
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

    /**
     * Checks if a logistics creep can be created with the given capacity.
     * @param capacity - Energy capacity available
     */
    @profile
    public static canCreateCreep(capacity: number): boolean {
        return fromBodyPlanSafe(capacity, BODY_PLAN_UNIT) !== null
    }

    /**
     * Determines if a new logistics creep should be spawned based on idle times.
     * @param spawn - The spawn to create from
     * @param capacity - Optional energy capacity override
     */
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
