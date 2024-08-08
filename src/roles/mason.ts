import * as Logger from 'utils/logger'
import * as TaskRunner from 'tasks/runner'
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
import { isAtEdge, moveTo, moveTowardsCenter, moveWithinRoom, recycle } from 'utils/creep'
import { profile, wrap } from 'utils/profiling'
import autoIncrement from 'utils/autoincrement'
import { fromBodyPlan } from 'utils/parts'
import { moveToRoom } from 'utils/travel'

const ROLE = 'mason'
type Wall = StructureWall | StructureRampart
type WallId = Id<Wall>

export interface Mason extends ResourceCreep {
    memory: MasonMemory
}

interface MasonMemory extends ResourceCreepMemory {
    role: 'mason'
    home: string
    repairTarget: WallId | null
}

export class MasonCreep {
    readonly creep: Mason

    constructor(creep: Mason) {
        this.creep = creep
    }

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

    @profile
    run(): void {
        if (this.creep.spawning) {
            return
        }

        if (this.creep.memory.tasks.length > 0) {
            const task = this.creep.memory.tasks[0]
            TaskRunner.run(task, this.creep)
            return
        }

        if (!this.isAtHome()) {
            this.goHome()
            return
        }

        if (isAtEdge(this.creep)) {
            moveTowardsCenter(this.creep)
            return
        }

        if (this.hasNoEnergy()) {
            this.repairTarget = null
            getEnergy(this.creep)
        } else if (this.hasSpawnSite()) {
            this.build(true)
        } else if (hasFragileWall(this.room) || this.repairTarget) {
            this.repair()
        } else if (hasWallSite(this.room)) {
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

    private repair() {
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

        this.repairTarget = structure.id

        const err = this.creep.repair(structure)
        if (err === ERR_NOT_IN_RANGE) {
            moveWithinRoom(structure.pos, this.creep, 3)
        } else if (err !== OK) {
            Logger.warning('logistics:repair-wall:failure', this.creep.name, err)
        }
    }

    private build(includeNonWallSites = false) {
        const targets = includeNonWallSites
            ? getConstructionSites(this.creep.room)
            : getWallSites(this.creep.room)
        if (targets.length) {
            const err = this.creep.build(targets[0])
            if (err === ERR_NOT_IN_RANGE) {
                moveTo(targets[0].pos, this.creep)
            } else if (err !== OK) {
                Logger.warning('mason:build:failure', err, this.creep.name)
            }
        } else {
            Logger.warning('mason:build', 'nothing to build', this.creep.room.name)
        }
    }

    private goHome() {
        moveToRoom(this.home, this.creep)
    }

    private isAtHome() {
        return this.creep.room.name === this.home
    }
}

export default {
    run: wrap((creep: Mason) => {
        const mason = new MasonCreep(creep)
        mason.run()
    }, `mason:run`),

    create(spawn: StructureSpawn): number {
        const capacity = spawn.room.energyCapacityAvailable
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
