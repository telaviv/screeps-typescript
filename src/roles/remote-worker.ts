import * as Logger from 'utils/logger'
import * as Logistics from 'roles/logistics'
import * as TaskRunner from 'tasks/runner'
import {
    LogisticsMemory,
    PREFERENCE_WORKER,
    TASK_COLLECTING,
    TASK_HAULING,
} from './logistics-constants'
import { ResourceCreep, ResourceCreepMemory } from 'tasks/types'
import { addEnergyTask } from 'tasks/usage-utils'
import { fromBodyPlan } from 'utils/parts'
import { getConstructionSites, hasNoSpawns } from 'utils/room'
import { hasNoEnergy, isFullOfEnergy } from 'utils/energy-harvesting'
import { moveToRoom, moveTo } from 'utils/travel'
import { profile, wrap } from 'utils/profiling'
import { wander } from 'utils/creep'
import { getConstructionFeaturesV3 } from 'construction-features'

const ROLE = 'remote-worker'

export interface RemoteWorker extends ResourceCreep {
    memory: RemoteWorkerMemory | LogisticsMemory
}

function isRemoteWorkerMemory(
    memory: ResourceCreepMemory | LogisticsMemory,
): memory is RemoteWorkerMemory {
    return memory.role === 'remote-worker'
}

interface RemoteWorkerMemory extends ResourceCreepMemory {
    role: 'remote-worker'
    destination: string
    home: string
    collecting: boolean
}

class RemoteWorkerCreep {
    readonly creep: RemoteWorker

    constructor(creep: RemoteWorker) {
        this.creep = creep
    }

    get destination(): string {
        return this.memory.destination
    }

    get destinationRoom(): Room {
        return Game.rooms[this.destination]
    }

    get home(): string {
        return this.memory.home
    }

    get memory(): RemoteWorkerMemory {
        if (!isRemoteWorkerMemory(this.creep.memory)) {
            throw new Error('Invalid remote worker memory')
        }
        return this.creep.memory
    }

    get collecting(): boolean {
        return this.memory.collecting
    }

    @profile
    run() {
        if (this.creep.spawning) {
            return
        }

        if (this.creep.room.name !== this.destination) {
            moveToRoom(this.creep, this.destination)
        }

        if (!this.creep.memory.tasks) {
            this.creep.memory.tasks = []
        }

        if (this.creep.memory.tasks.length > 0) {
            const task = this.creep.memory.tasks[0]
            TaskRunner.run(task, this.creep)
            return
        }

        if (this.shouldTransform()) {
            this.transform()
            return
        }

        if (this.collecting) {
            if (this.isFullOfEnergy()) {
                this.memory.collecting = false
                this.deliverEnergy()
            } else {
                this.collectEnergy()
            }
        } else {
            if (this.hasNoEnergy()) {
                this.memory.collecting = true
                this.collectEnergy()
            } else {
                this.deliverEnergy()
            }
        }
    }

    private shouldTransform(): boolean {
        return this.destinationRoom && !hasNoSpawns(this.destinationRoom)
    }

    private transform() {
        const hasWorkParts = this.creep.getActiveBodyparts(WORK) > 0
        const currentTask = this.hasNoEnergy() ? TASK_COLLECTING : TASK_HAULING
        const preference = hasWorkParts ? PREFERENCE_WORKER : TASK_HAULING

        Logger.info(
            'remote-worker:transform',
            this.creep.name,
            this.memory.destination,
            hasWorkParts ? 'worker' : 'hauler',
        )

        const memory = {
            role: Logistics.ROLE,
            home: this.memory.destination,
            preference,
            currentTask,
            currentTarget: undefined,
            idleTimestamp: null,
            tasks: [],
        } as LogisticsMemory
        this.creep.memory = memory
    }

    private collectEnergy(): void {
        this.creep.say('⚡')
        if (!addEnergyTask(this.creep)) {
            // No energy available - try dismantling as fallback (doesn't need energy)
            if (this.needsDismantling()) {
                this.creep.say('🔨')
                this.dismantleMovementStructures()
            } else {
                this.creep.say('🤔')
                wander(this.creep)
            }
            return
        }
    }

    private hasNoEnergy() {
        return hasNoEnergy(this.creep)
    }

    private isFullOfEnergy() {
        return isFullOfEnergy(this.creep)
    }

    private needsDismantling(): boolean {
        if (!this.destinationRoom) {
            return false
        }

        const features = getConstructionFeaturesV3(this.destinationRoom)
        if (!features || features.type === 'none' || !features.movement) {
            return false
        }

        // Check if there are any structures to dismantle
        const movement = features.movement
        for (const structureType of Object.keys(movement)) {
            const arrays = movement[structureType as BuildableStructureConstant]
            if (arrays && arrays.moveFrom && arrays.moveFrom.length > 0) {
                return true
            }
        }

        return false
    }

    private dismantleMovementStructures(): void {
        this.creep.say('🔨')

        const features = getConstructionFeaturesV3(this.destinationRoom)
        if (!features || features.type === 'none' || !features.movement) {
            return
        }

        // Find weakest structure to dismantle (lowest hits)
        let weakestStructure: Structure | null = null
        let lowestHits = Infinity

        for (const [structureType, { moveFrom }] of Object.entries(features.movement)) {
            for (const pos of moveFrom) {
                // Skip structures on map edges - they cannot be destroyed
                if (pos.x === 0 || pos.x === 49 || pos.y === 0 || pos.y === 49) {
                    continue
                }

                const structures = this.destinationRoom.lookForAt(LOOK_STRUCTURES, pos.x, pos.y)

                for (const structure of structures) {
                    if (structure.structureType === structureType) {
                        if (structure.hits < lowestHits) {
                            lowestHits = structure.hits
                            weakestStructure = structure
                        }
                    }
                }
            }
        }

        if (!weakestStructure) {
            Logger.warning('remote-worker:dismantle:no-structure-found', this.destination)
            return
        }

        const err = this.creep.dismantle(weakestStructure)
        if (err === ERR_NOT_IN_RANGE) {
            moveTo(this.creep, { pos: weakestStructure.pos, range: 1 })
        } else if (err === OK) {
            Logger.info(
                'remote-worker:dismantle:success',
                this.creep.name,
                weakestStructure.structureType,
                weakestStructure.pos,
            )
        } else if (err === ERR_INVALID_TARGET) {
            // Structure was already destroyed or doesn't exist
            Logger.warning(
                'remote-worker:dismantle:invalid-target',
                this.creep.name,
                weakestStructure.pos,
            )
        } else {
            Logger.warning(
                'remote-worker:dismantle:failed',
                err,
                this.creep.name,
                weakestStructure.pos,
            )
        }
    }

    private deliverEnergy() {
        const controller = this.destinationRoom.controller
        if (!controller) {
            Logger.error('remote-worker:deliver:no-controller', this.destination, this.creep.name)
            return
        }

        // Check if controller needs urgent upgrading or if there are construction sites
        const hasWork =
            controller.ticksToDowngrade <= 5000 ||
            getConstructionSites(this.destinationRoom).length > 0

        if (!hasWork && this.needsDismantling()) {
            // No work to do, but structures need dismantling
            this.dismantleMovementStructures()
            return
        }

        if (controller.ticksToDowngrade > 5000) {
            this.build()
        } else {
            this.upgradeController()
        }
    }

    private build() {
        this.creep.say('🏗️')
        const targets = getConstructionSites(this.destinationRoom)
        if (targets.length) {
            const err = this.creep.build(targets[0])
            if (err === ERR_NOT_IN_RANGE) {
                moveTo(this.creep, { pos: targets[0].pos, range: 3 })
            } else if (err !== OK) {
                Logger.warning('remote-worker:build:failure', err, this.creep.name, targets[0].pos)
            }
        } else {
            Logger.warning(
                'remote-worker:build:failure',
                'nothing to build',
                this.creep.memory.home,
                this.creep.room.name,
                this.destinationRoom.name,
            )
        }
    }

    private upgradeController() {
        this.creep.say('🌃')
        const controller = this.destinationRoom.controller
        if (!controller) {
            Logger.error('remote-worker:upgrade:no-controller', this.destination, this.creep.name)
            return
        }

        const err = this.creep.upgradeController(controller)
        if (err === ERR_NOT_IN_RANGE) {
            this.creep.moveTo(controller, {
                visualizePathStyle: { stroke: '#ffffff' },
                range: 3,
            })
        } else if (err !== OK) {
            Logger.error(
                'remote-worker:upgrade:failure',
                controller.room.name,
                err,
                this.creep.name,
            )
        }
    }
}

export default {
    run: wrap((creep: RemoteWorker) => {
        const RemoteWorker = new RemoteWorkerCreep(creep)
        RemoteWorker.run()
    }, 'roleRemoteWorker:run'),

    create(spawn: StructureSpawn, destination: string, capacity: number | null = null): number {
        capacity = capacity || spawn.room.energyCapacityAvailable
        const parts = fromBodyPlan(capacity, [CARRY, MOVE], { fixed: [WORK, MOVE] })
        const sortedParts = [...parts.slice(1), parts[0]]
        return spawn.spawnCreep(sortedParts, `${ROLE}:${Game.time}`, {
            memory: {
                role: ROLE,
                home: destination,
                destination,
                tasks: [],
                idleTimestamp: null,
                collecting: true,
            } as RemoteWorkerMemory,
        })
    },
}
