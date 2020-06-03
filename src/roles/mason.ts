/* eslint no-lonely-if: ["off"] */

import * as TaskRunner from 'tasks/runner'
import { isAtEdge, moveToRoom, moveTowardsCenter, recycle } from 'utils/creep'
import { profile } from 'utils/profiling'
import { getEnergy, isFullOfEnergy, hasNoEnergy } from 'utils/energy-harvesting'
import {
    hasFragileWall,
    hasWeakWall,
    hasWallSite,
    getWeakestWall,
    getWallSites,
} from 'utils/room'
import * as Logger from 'utils/logger'
import { fromBodyPlan } from 'utils/parts'
import autoIncrement from 'utils/autoincrement'

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

    static shouldCreate(room: Room) {
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

    get room() {
        return this.creep.room
    }

    get home() {
        return this.memory.home
    }

    @profile
    run() {
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

    private shouldRecycle() {
        const ticksToLive: number = this.creep.ticksToLive!
        return ticksToLive < 50
    }

    private hasNoEnergy() {
        return hasNoEnergy(this.creep)
    }

    private isFullOfEnergy() {
        return isFullOfEnergy(this.creep)
    }

    private repair() {
        let structure = null
        if (this.repairTarget) {
            structure = Game.getObjectById<Wall>(this.repairTarget)
            if (structure === null) {
                Logger.warning(
                    'mason:repair:target:failure',
                    this.creep.name,
                    this.repairTarget,
                )
            }
        }

        if (structure === null) {
            structure = getWeakestWall(this.creep.room)
        }

        if (structure === null || structure.hits === structure.hitsMax) {
            Logger.warning(
                'mason:repair:cant-repair',
                this.creep.name,
                this.repairTarget,
            )
            return
        }

        this.repairTarget = structure.id

        const err = this.creep.repair(structure)
        if (err === ERR_NOT_IN_RANGE) {
            this.creep.moveTo(structure.pos, {
                visualizePathStyle: { stroke: '#ffffff' },
                range: 3,
            })
        } else if (err !== OK) {
            Logger.warning(
                'logistics:repair-wall:failure',
                this.creep.name,
                err,
            )
        }
    }

    private build() {
        const targets = getWallSites(this.creep.room)
        if (targets.length) {
            const err = this.creep.build(targets[0])
            if (err === ERR_NOT_IN_RANGE) {
                this.creep.moveTo(targets[0], {
                    visualizePathStyle: { stroke: '#ffffff' },
                    range: 3,
                })
            } else if (err !== OK) {
                Logger.warning('mason:build:failure', err, this.creep.name)
            }
        } else {
            Logger.warning(
                'mason:build',
                'nothing to build',
                this.creep.room.name,
            )
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
    run: (creep: Mason) => {
        const mason = new MasonCreep(creep)
        mason.run()
    },

    create(spawn: StructureSpawn): number {
        const capacity = spawn.room.energyCapacityAvailable
        const parts = fromBodyPlan(capacity, [CARRY, WORK, MOVE, MOVE])
        return spawn.spawnCreep(
            parts,
            `${ROLE}:${spawn.room.name}:${autoIncrement()}`,
            {
                memory: {
                    role: ROLE,
                    home: spawn.room.name,
                    tasks: [],
                    waitTime: 0,
                    repairTarget: null,
                } as MasonMemory,
            },
        )
    },
}
