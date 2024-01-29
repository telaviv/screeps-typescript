import filter from 'lodash/filter'
import EnergySinkManager from 'managers/energy-sink-manager'
import { getBuildManager } from 'managers/build-manager'
import { moveToRoom } from 'utils/creep'
import { hasNoEnergy, isFullOfEnergy } from 'utils/energy-harvesting'
import { fromBodyPlan, fromBodyPlanSafe } from 'utils/parts'
import { mprofile } from 'utils/profiling'
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
import * as MiningTask from 'tasks/mining'
import * as WithdrawTask from 'tasks/withdraw'
import * as PickupTask from 'tasks/pickup'
import {
    LogisticsCreep,
    LogisticsMemory,
    LogisticsTask,
    LogisticsPreference,
    NO_TASK,
    PREFERENCE_WORKER,
    TASK_MINING,
    TASK_BUILDING,
    TASK_COLLECTING,
    TASK_HAULING,
    TASK_REPAIRING,
    TASK_UPGRADING,
    TASK_WALL_REPAIRS,
} from './logistics-constants'
import { fromRoom } from 'utils/immutable-room'
import { isMiningTask } from 'tasks/mining/utils'

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
const watchedScreep = 'logistics:worker:W8N3:25120'

class RoleLogistics {
    private creep: LogisticsCreep;

    constructor(creep: LogisticsCreep) {
        this.creep = creep;
    }

    @mprofile('runLogistics')
    public run() {
        if (this.creep.spawning) {
            return
        }
        if (this.creep.memory.tasks.length > 0 || this.creep.memory.currentTask !== NO_TASK) {
            this.unidle()
        } else {
            this.idle()
        }

        this.say();
        this.updateMemory();
        if (this.idleTime() > SUICIDE_TIME) {
            this.creep.suicide();
            return;
        }

        if (this.creep.room.name !== this.creep.memory.home) {
            moveToRoom(this.creep.memory.home, this.creep);
            return;
        }

        const currentTask = this.creep.memory.currentTask;
        const tasks = this.creep.memory.tasks

        if (tasks.length > 0) {
            this.runTask();
        } else if (currentTask === TASK_COLLECTING) {
            this.getEnergy()
        } else if (currentTask === TASK_HAULING) {
            this.haulEnergy();
        } else if (currentTask === TASK_BUILDING) {
            this.build();
        } else if (currentTask === TASK_UPGRADING) {
            this.upgrade();
        } else if (currentTask === TASK_REPAIRING) {
            this.repair();
        } else if (currentTask === TASK_WALL_REPAIRS) {
            this.repairWalls();
        } else if (currentTask === NO_TASK) {
            this.wander();
            this.switchTask();
        }
    }

    public static staticRun(creep: LogisticsCreep) {
        return (new RoleLogistics(creep)).run();
    }

    private getEnergy(): void {
        const taskMap = [
            { tasker: PickupTask, name: 'pickup' },
            { tasker: WithdrawTask, name: 'withdraw' },
            { tasker: MiningTask, name: 'mining' }
        ]
        for (const { tasker, name } of taskMap) {
            const ret = tasker.makeRequest(this.creep)
            if (ret) {
                if (this.creep.memory.tasks.length === 0) {
                    Logger.error('logistics:getEnergy:failureToMakeTask', name, this.creep.name)
                } else {
                    return
                }
            }
        }
        Logger.debug('logistics:getEnergy:failure', 'no tasks could be made', this.creep.name)
        this.setToNoTask('no tasks could be made')
    }

    private setToNoTask(reason: string): void {
        if (this.creep.memory.tasks.length > 0) {
            Logger.warning('logistics:setToNoTask:failure:hasTasks', this.creep.name, reason)
            return
        }
        this.creep.memory.currentTask = NO_TASK
    }

    @mprofile('logistics:updateMemory')
    private updateMemory() {
        const memory = this.creep.memory;
        const currentTask = memory.currentTask;

        if (currentTask === TASK_COLLECTING && isFullOfEnergy(this.creep)) {
            if (memory.preference === PREFERENCE_WORKER) {
                this.assignWorkerPreference();
            } else {
                memory.currentTask = memory.preference;
            }
        } else if (currentTask !== TASK_COLLECTING && hasNoEnergy(this.creep)) {
            memory.currentTask = TASK_COLLECTING;
        }
    }


    private assignWorkerPreference() {
        const memory = this.creep.memory;
        const buildManager = getBuildManager(this.creep.room);
        if (TransferTask.makeRequest(this.creep)) {
            memory.currentTask = TASK_HAULING;
        } else if (buildManager.canBuildImportant()) {
            memory.currentTask = TASK_BUILDING;
        } else if (hasOwnFragileWall(this.creep.room)) {
            memory.currentTask = TASK_WALL_REPAIRS;
        } else if (EnergySinkManager.canRepairNonWalls(this.creep.room)) {
            memory.currentTask = TASK_REPAIRING;
        } else {
            memory.currentTask = TASK_UPGRADING;
        }
    }

    say() {
        if (this.idleTime() > SLEEP_SAY_TIME) {
            this.creep.say('😴')
            return
        }
        const memory = this.creep.memory;
        const preference = PREFERENCE_EMOJIS[memory.preference];
        const currentTask = TASK_EMOJIS[memory.currentTask];
        const tasks = this.creep.memory.tasks
        if (tasks.length > 0 && tasks[0] === undefined) {
            throw new Error(`undefined task: ${this.creep.name}: ${JSON.stringify(tasks)} $${tasks.length}`)
        }
        if (tasks.length > 0 && isMiningTask(tasks[0])) {
            this.creep.say(`${preference} ⛏️`)
        } else if (currentTask === NO_TASK) {
            this.creep.say('🤔')
        } else {
            this.creep.say(`${preference} ${currentTask}`);
        }
    }

    private idleTime(): number {
        return Game.time - (this.creep.memory.idleTimestamp || Game.time);
    }

    private idle() {
        if (this.creep.memory.idleTimestamp === null) {
            this.creep.memory.idleTimestamp = Game.time
        }
    }

    private unidle() {
        this.creep.memory.idleTimestamp = null;
    }

    @mprofile('logistics:build')
    build() {
        const targets = this.getNonWallSites(this.creep.room);
        const target = this.creep.pos.findClosestByRange(targets);
        if (target) {
            if (this.creep.build(target) === ERR_NOT_IN_RANGE) {
                this.creep.moveTo(target, {
                    visualizePathStyle: { stroke: '#ffffff' },
                    range: 3,
                });
            }
        } else if (isFullOfEnergy(this.creep)) {
            this.switchTask();
        } else {
            this.creep.memory.currentTask = TASK_COLLECTING;
        }
    }

    getNonWallSites(room: Room) {
        return getConstructionSites(room, {
            filter: (site: ConstructionSite) =>
                site.structureType !== STRUCTURE_WALL &&
                site.structureType !== STRUCTURE_RAMPART,
        });
    }

    @mprofile('logistics:repairWalls')
    repairWalls() {
        let structure = null;
        if (this.creep.memory.currentTarget) {
            structure = Game.getObjectById<Structure>(
                this.creep.memory.currentTarget,
            );
            if (structure === null) {
                Logger.warning(
                    'repair:target:failure',
                    this.creep.name,
                    this.creep.memory.currentTarget,
                );
            }
        }

        if (structure === null) {
            structure = getOwnWeakestWall(this.creep.room);
        }

        if (structure === null || structure.hits === structure.hitsMax) {
            this.switchTask();
            return;
        }

        this.creep.memory.currentTarget = structure.id;

        const err = this.creep.repair(structure);
        if (err === ERR_NOT_IN_RANGE) {
            this.creep.moveTo(structure.pos, {
                visualizePathStyle: { stroke: '#ffffff' },
                range: 3,
            });
        } else if (err !== OK) {
            Logger.warning('logistics:repair-wall:failure', this.creep.name, err);
        }
    }

    @mprofile('logistics:repair')
    repair() {
        const structure = EnergySinkManager.findRepairTarget(this.creep);
        if (structure === null) {
            this.switchTask();
            return;
        }

        const err = this.creep.repair(structure);
        if (err === ERR_NOT_IN_RANGE) {
            this.creep.moveTo(structure.pos, {
                visualizePathStyle: { stroke: '#ffffff' },
                range: 3,
            });
        } else if (err !== OK) {
            Logger.warning('logistics:repair:failure', this.creep.name, err);
        }
    }

    @mprofile('logistics:upgrade')
    upgrade() {
        if (!this.creep.room.controller) {
            this.creep.say('???');
            return;
        }
        if (
            this.creep.upgradeController(this.creep.room.controller) === ERR_NOT_IN_RANGE
        ) {
            this.creep.moveTo(this.creep.room.controller, {
                visualizePathStyle: { stroke: '#ffffff' },
                range: 3,
            });
        }
    }

    @mprofile('logistics:haulEnergy')
    haulEnergy() {
        if (TransferTask.makeRequest(this.creep)) {
            this.runTask();
        } else {
            this.switchTask();
        }
    }


    private wander() {
        const iroom = fromRoom(this.creep.room)
        const pos = iroom.getRandomWalkablePosition(this.creep.pos.x, this.creep.pos.y)
        if (pos !== null) {
            this.creep.moveTo(pos)
        }
    }

    private runTask() {
        const task = this.creep.memory.tasks[0];
        TaskRunner.run(task, this.creep);
    }

    switchTask() {
        let task: LogisticsTask = this.creep.memory.currentTask;
        if (!isAtExtensionCap(this.creep.room) || hasTunnelSite(this.creep.room)) {
            task = TASK_BUILDING;
        } else if (hasOwnFragileWall(this.creep.room)) {
            task = TASK_WALL_REPAIRS;
        } else if (EnergySinkManager.canRepairNonWalls(this.creep.room)) {
            task = TASK_REPAIRING;
        } else {
            task = TASK_UPGRADING;
        }
        if (this.creep.memory.currentTask === task || this.creep.memory.currentTask !== NO_TASK) {
            Logger.info(
                'logistics:switch-task:failure',
                this.creep.name,
                "couldn't switch from",
                task,
                '(',
                isAtExtensionCap(this.creep.room),
                ',',
                hasTunnelSite(this.creep.room),
                ')',
            );
        }
        this.creep.memory.currentTask = task;
    }

    static requestedCarryCapacity(spawn: StructureSpawn): number {
        const parts = calculateParts(spawn.room.energyCapacityAvailable);
        const carrys = filter(parts, (p: BodyPartConstant) => p === CARRY);
        return carrys.length * 50;
    }

    public static createCreep(
        spawn: StructureSpawn,
        preference: LogisticsPreference = TASK_HAULING,
        rescue = false,
    ): ScreepsReturnCode {
        const capacity = rescue
            ? Math.max(300, spawn.room.energyAvailable)
            : spawn.room.energyAvailable;
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
        );
    }

    public static canCreateCreep(capacity: number): boolean {
        return fromBodyPlanSafe(capacity, BODY_PLAN_UNIT) !== null;
    }

    public static shouldCreateCreep(spawn: StructureSpawn): boolean {
        const logistics = filter(Object.keys(Memory.creeps), (creepName: string) => {
            const creep = Game.creeps[creepName] as LogisticsCreep
            return (
                creep &&
                creep.memory.role === 'logistics' &&
                creep.room.name === spawn.room.name
            )
        }).map((creepName: string) => new RoleLogistics(Game.creeps[creepName] as LogisticsCreep))

        const maxIdleTime = logistics.reduce((max: number, role: RoleLogistics) => {
            return Math.max(max, role.idleTime())
        }, 0)
        const canCreateCreep = RoleLogistics.canCreateCreep(spawn.room.energyAvailable);
        const retVal = RoleLogistics.canCreateCreep(spawn.room.energyAvailable) && maxIdleTime <= RESPAWN_IDLE_LIMIT
        Logger.debug(
            'logistics:shouldCreateCreep',
            JSON.stringify(logistics.map((role: RoleLogistics) => ({ name: role.creep.name, idleTime: role.idleTime() }))),
            maxIdleTime,
            spawn.room.energyAvailable,
            canCreateCreep,
            retVal)
        return retVal
    }

}

/**
 * Checks if a creep can spawn with the given energy capacity
 * @param capacity total energy capacity
 * @returns true if the creep can be spawned.
 */
export function calculateParts(capacity: number): BodyPartConstant[] {
    const plan = fromBodyPlan(capacity, BODY_PLAN_UNIT);
    Logger.debug('logistics:calculateParts', JSON.stringify(plan), capacity);
    return plan;
}

export default RoleLogistics;
