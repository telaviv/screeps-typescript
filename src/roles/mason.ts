import * as Logger from 'utils/logger'
import * as TaskRunner from 'tasks/runner'
import * as TransferTask from 'tasks/transfer'
import { ResourceCreep, ResourceCreepMemory } from 'tasks/types'
import {
    getConstructionSites,
    getSpawnSites,
    getWallSites,
    getWeakestWall,
    hasFragileWall,
    hasWallSite,
    hasWeakWall,
} from 'utils/room'
import { getEnergy, hasNoEnergy } from 'utils/energy-harvesting'
import { moveToRoom, moveWithinRoom } from 'utils/travel'
import { profile, wrap } from 'utils/profiling'
import autoIncrement from 'utils/autoincrement'
import { fromBodyPlan } from 'utils/parts'
import { recycle } from 'utils/creep'

const ROLE = 'mason'
/** Wall type union for walls and ramparts */
type Wall = StructureWall | StructureRampart
type WallId = Id<Wall>

/** Modulo divisor for throttling repair actions based on WORK parts */
const WORK_MODULO = 3

/** Mason creep with typed memory */
export interface Mason extends ResourceCreep {
    memory: MasonMemory
}

/** Memory structure for mason creeps */
interface MasonMemory extends ResourceCreepMemory {
    role: 'mason'
    home: string
    repairTarget: WallId | null
}

/**
 * Dedicated wall and rampart repair creep.
 * Focuses on building and repairing defensive structures.
 */
export class MasonCreep {
    readonly creep: Mason

    constructor(creep: Mason) {
        this.creep = creep
    }

    /**
     * Checks if a mason should be created for a room.
     * @param room - The room to check
     */
    static shouldCreate(room: Room): boolean {
        return hasWeakWall(room) || hasWallSite(room)
    }

    get memory(): MasonMemory {
        return this.creep.memory
    }

    get repairTarget(): WallId | null {
        return this.memory.repairTarget
    }

    set repairTarget(target: WallId | null) {
        this.memory.repairTarget = target
    }

    get room(): Room {
        return this.creep.room
    }

    get home(): string {
        return this.memory.home
    }

    /**
     * Main mason behavior loop.
     * Collects energy, builds wall sites, and repairs weak walls.
     */
    @profile
    run(): void {
        if (this.creep.spawning) {
            return
        }

        if (this.creep.memory.tasks.length > 0) {
            const task = this.creep.memory.tasks[0]
            this.creep.say('🧱⚡')
            TaskRunner.run(task, this.creep)
            return
        }

        if (!this.isAtHome()) {
            this.goHome()
            return
        }

        if (this.hasNoEnergy()) {
            this.repairTarget = null
            getEnergy(this.creep)
        } else if (this.creep.room.memory.collapsed === true) {
            this.transferEnergy()
        } else if (this.hasSpawnSite()) {
            this.build(true)
        } else if (hasFragileWall(this.room) || this.repairTarget) {
            this.repair()
        } else if (hasWallSite(this.room)) {
            this.repairTarget = null
            this.build()
        } else if (hasWeakWall(this.room)) {
            this.repair()
        } else {
            recycle(this.creep)
        }
    }

    private hasNoEnergy(): boolean {
        return hasNoEnergy(this.creep)
    }

    private hasSpawnSite(): boolean {
        return getSpawnSites(this.creep.room).length > 0
    }

    /** Repairs the current target wall or finds the weakest wall */
    private repair() {
        this.creep.say('🧱🧱')

        let structure = null
        if (this.repairTarget) {
            structure = Game.getObjectById<Wall>(this.repairTarget)
            if (structure === null) {
                Logger.warning('mason:repair:target:failure', this.creep.name, this.repairTarget)
            }
        }

        if (structure === null) {
            structure = getWeakestWall(this.creep.room)
        }

        if (structure === null || structure.hits === structure.hitsMax) {
            Logger.warning('mason:repair:cant-repair', this.creep.name, this.repairTarget)
            return
        }

        if (!this.creep.pos.inRangeTo(structure, 3)) {
            moveWithinRoom(this.creep, { pos: structure.pos, range: 3 })
            return
        }

        this.repairTarget = structure.id
        if (Game.time % (Math.floor(this.creep.getActiveBodyparts(WORK) / WORK_MODULO) + 1) !== 0) {
            Logger.debug('mason:repair:skip', this.creep.name, structure.id)
            return
        }

        const err = this.creep.repair(structure)
        if (err === ERR_NOT_IN_RANGE) {
            moveWithinRoom(this.creep, { pos: structure.pos, range: 3 })
        } else if (err !== OK && err !== ERR_TIRED) {
            Logger.warning('logistics:repair-wall:failure', this.creep.name, err)
        }
    }

    /**
     * Builds wall construction sites.
     * @param includeNonWallSites - If true, also builds non-wall sites
     */
    private build(includeNonWallSites = false) {
        this.creep.say('🧱🏗️')
        const targets = includeNonWallSites
            ? getConstructionSites(this.creep.room)
            : getWallSites(this.creep.room)
        if (targets.length) {
            const err = this.creep.build(targets[0])
            if (err === ERR_NOT_IN_RANGE) {
                const nerr = moveWithinRoom(this.creep, { pos: targets[0].pos, range: 3 })
                if (nerr !== OK) {
                    Logger.warning('mason:build:moveTo:failure', nerr, this.creep.name)
                }
            } else if (err !== OK) {
                Logger.warning('mason:build:failure', err, this.creep.name)
            }
        } else {
            Logger.warning('mason:build', 'nothing to build', this.creep.room.name)
        }
    }

    /** Transfers energy to spawns during collapse recovery */
    private transferEnergy() {
        this.creep.say('🧱🚚')
        TransferTask.makeRequest(this.creep)
    }

    /** Moves to home room */
    private goHome() {
        moveToRoom(this.creep, this.home)
    }

    /** Checks if in home room */
    private isAtHome() {
        return this.creep.room.name === this.home
    }
}

/** Role module for mason wall/rampart repair creeps */
export default {
    /**
     * Runs the mason behavior for a creep.
     * @param creep - The mason creep
     */
    run: wrap((creep: Mason) => {
        const mason = new MasonCreep(creep)
        mason.run()
    }, `mason:run`),

    /**
     * Creates a mason creep.
     * @param spawn - The spawn to create from
     * @param capacity - Energy capacity override
     */
    create(spawn: StructureSpawn, capacity?: number): number {
        if (!capacity) {
            capacity = spawn.room.energyAvailable
        }
        const parts = fromBodyPlan(capacity, [CARRY, WORK, MOVE, MOVE])
        return spawn.spawnCreep(parts, `${ROLE}:${spawn.room.name}:${autoIncrement()}`, {
            memory: {
                role: ROLE,
                home: spawn.room.name,
                tasks: [],
                idleTimestamp: null,
                repairTarget: null,
            } as MasonMemory,
        })
    },
}
