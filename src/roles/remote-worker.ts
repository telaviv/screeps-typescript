import * as Logger from 'utils/logger'
import * as Logistics from 'roles/logistics'
import * as TaskRunner from 'tasks/runner'
import { LogisticsMemory, TASK_COLLECTING, TASK_HAULING } from './logistics-constants'
import { ResourceCreep, ResourceCreepMemory } from 'tasks/types'
import { getConstructionSites, hasNoSpawns } from 'utils/room'
import { hasNoEnergy, isFullOfEnergy } from 'utils/energy-harvesting'
import { moveToRoom, moveTo } from 'utils/travel'
import { profile, wrap } from 'utils/profiling'
import { addEnergyTask } from 'tasks/usage-utils'
import { fromBodyPlan } from 'utils/parts'
import { wander } from 'utils/creep'

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
        const currentTask = this.hasNoEnergy() ? TASK_COLLECTING : TASK_HAULING
        const memory = {
            role: Logistics.ROLE,
            home: this.memory.destination,
            preference: TASK_HAULING,
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
            this.creep.say('🤔')
            wander(this.creep)
            return
        }
    }

    private hasNoEnergy() {
        return hasNoEnergy(this.creep)
    }

    private isFullOfEnergy() {
        return isFullOfEnergy(this.creep)
    }

    private deliverEnergy() {
        const controller = this.destinationRoom.controller
        if (!controller) {
            Logger.error('remote-worker:deliver:no-controller', this.destination, this.creep.name)
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
        const parts = fromBodyPlan(capacity, [CARRY, MOVE], [WORK, MOVE])
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
