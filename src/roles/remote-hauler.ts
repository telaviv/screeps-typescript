import * as Logger from 'utils/logger'
import { ResourceCreep, ResourceCreepMemory } from 'tasks/types'
import { getConstructionFeatures, getStationaryPointsMine } from 'construction-features'
import { moveToRoom, moveWithinRoom } from 'utils/travel'
import { profile, wrap } from 'utils/profiling'
import { LogisticsCreep } from './logistics-constants'
import { fromBodyPlan } from 'utils/parts'
import { getVirtualStorage } from '../utils/virtual-storage'

const ROLE = 'remote-hauler'

export interface RemoteHauler extends ResourceCreep {
    memory: RemoteHaulerMemory
    storageTransfered: boolean
}

export interface RemoteHaulerMemory extends ResourceCreepMemory {
    role: 'remote-hauler'
    home: string
    remote: string
    target: Id<Source> | null
    pickupTracker: Record<Id<Source>, boolean>
}

export function isRebalancer(creep: Creep): creep is RemoteHauler {
    return (creep as LogisticsCreep).memory.role === ROLE
}

export class RemoteHaulerCreep {
    readonly creep: RemoteHauler

    constructor(creep: RemoteHauler) {
        this.creep = creep
    }

    get memory(): RemoteHaulerMemory {
        return this.creep.memory
    }

    get target(): Id<Source> | null {
        return this.memory.target
    }

    get currentRoom(): Room {
        return this.creep.room
    }

    get remoteRoom(): Room {
        return Game.rooms[this.creep.memory.remote]
    }

    get targetPos(): RoomPosition | null {
        if (!this.target) {
            Logger.error('remote-hauler:targetPos:no-target', this.creep.name)
            return null
        }
        return this.getPositionFromSourceId(this.target)
    }

    @profile
    run(): void {
        if (this.creep.spawning) {
            return
        }

        const freeCapacity = this.creep.store.getFreeCapacity()
        const isHome = this.creep.room.name === this.creep.memory.home
        const isRemote = this.creep.room.name === this.creep.memory.remote
        const target = this.memory.target

        if (isHome && this.allPickupsFree()) {
            this.goToRemote()
            return
        } else if (isHome && (this.allPickupsComplete() || freeCapacity === 0)) {
            this.dropOff()
        } else if (isRemote && (this.allPickupsComplete() || freeCapacity === 0)) {
            this.goToHome()
        } else if (!target) {
            this.getTarget()
        } else if (this.canPickup()) {
            this.pickup()
        } else {
            this.moveToTarget()
        }
    }

    allPickupsFree(): boolean {
        return Object.values(this.memory.pickupTracker).every((picked) => !picked)
    }

    allPickupsComplete(): boolean {
        return Object.values(this.memory.pickupTracker).every((picked) => picked)
    }

    canPickup(): boolean {
        if (!this.target) {
            return false
        }
        const picked = this.memory.pickupTracker[this.target]
        if (picked) {
            return false
        }
        const pos = this.targetPos
        if (!pos) {
            Logger.error('remote-hauler:canPickup:no-target-pos', this.target)
            return false
        }
        return this.creep.pos.isNearTo(pos)
    }

    getTarget(): void {
        const targets = Object.entries(this.memory.pickupTracker).filter(([, picked]) => !picked)
        if (targets.length === 0) {
            this.memory.target = null
            return
        }

        targets.sort(([id1], [id2]) => {
            const energy1 = this.getEnergyAtSource(id1 as Id<Source>)
            const energy2 = this.getEnergyAtSource(id2 as Id<Source>)
            return energy2 - energy1
        })
        this.memory.target = targets[0][0] as Id<Source>
        this.moveToTarget()
    }

    getEnergyAtSource(id: Id<Source>): number {
        if (!this.remoteRoom) {
            Logger.error(
                'remote-hauler:getEnergyAtSource:no-vision-to-remote',
                this.creep.name,
                this.creep.memory.remote,
            )
            return 0
        }
        const container = this.getContainerTarget(id)
        const droppedEnergy = this.getPickupTarget(id)?.amount ?? 0
        return (container?.store.getUsedCapacity(RESOURCE_ENERGY) ?? 0) + droppedEnergy
    }

    getPositionFromSourceId(id: Id<Source>): RoomPosition | null {
        const points = getStationaryPointsMine(this.creep.room)
        if (!points) {
            Logger.error(
                'remote-hauler:getPositionFromSourceId:no-stationary-points',
                this.creep.name,
                this.creep.room.name,
            )
            return null
        }
        const pos = points.sources[id]
        if (!pos) {
            Logger.error(
                'remote-hauler:getPositionFromSourceId:no-id-in-sources',
                this.creep.name,
                this.creep.room.name,
                points.sources,
            )
            return null
        }
        return new RoomPosition(pos.x, pos.y, Game.rooms[this.creep.memory.remote].name)
    }

    pickup(): void {
        if (!this.target) {
            Logger.error('no target found', this.creep.name)
            return
        }

        const pickupTarget = this.getPickupTarget(this.target)
        const containerTarget = this.getContainerTarget(this.target)
        if (pickupTarget) {
            this.creep.pickup(pickupTarget)
        }
        if (containerTarget) {
            this.creep.withdraw(containerTarget, RESOURCE_ENERGY)
        }
        this.memory.pickupTracker[this.target] = true
        this.memory.target = null
    }

    dropOff(): void {
        let transferAmount = 0
        const virtualStorage = getVirtualStorage(this.creep.memory.home)
        if (virtualStorage) {
            transferAmount = Math.min(
                this.creep.store.getUsedCapacity(RESOURCE_ENERGY),
                virtualStorage.store.getFreeCapacity(RESOURCE_ENERGY),
            )
        }
        const features = getConstructionFeatures(this.creep.room)
        if (!features) {
            Logger.error('remote-hauler:dropoff:no-features found in room', this.creep.room.name)
            return
        }
        const featureStorage = features[STRUCTURE_STORAGE]
        if (!featureStorage || featureStorage.length === 0) {
            Logger.error('remote-hauler:dropoff:no-storage found in room', this.creep.room.name)
            return
        }
        const storagePos = featureStorage[0]
        if (!this.creep.pos.isNearTo(storagePos.x, storagePos.y)) {
            moveWithinRoom(this.creep, {
                pos: new RoomPosition(storagePos.x, storagePos.y, this.creep.room.name),
                range: 1,
            })
            return
        }
        const dropAmount = this.creep.store.getUsedCapacity(RESOURCE_ENERGY) - transferAmount
        if (transferAmount > 0 && virtualStorage) {
            this.creep.transfer(virtualStorage, RESOURCE_ENERGY, transferAmount)
        }
        if (dropAmount > 0) {
            this.creep.drop(RESOURCE_ENERGY, dropAmount)
        }
        for (const key in this.memory.pickupTracker) {
            this.memory.pickupTracker[key as Id<Source>] = false
        }
    }

    getPickupTarget(id: Id<Source>): Resource<RESOURCE_ENERGY> | null {
        const pos = this.getPositionFromSourceId(id)
        if (!pos) {
            Logger.warning('remote-hauler:getPickupTarget:no-pos', this.creep.name, id)
            return null
        }
        const droppedEnergy = this.remoteRoom
            .lookForAt(LOOK_RESOURCES, pos)
            .filter((r) => r.resourceType === RESOURCE_ENERGY)
        if (droppedEnergy.length === 0) {
            return null
        }
        return droppedEnergy[0] as Resource<RESOURCE_ENERGY>
    }

    getContainerTarget(id: Id<Source>): StructureContainer | null {
        const pos = this.getPositionFromSourceId(id)
        if (!pos) {
            Logger.warning('remote-hauler:getContainerTarget:no-pos', this.creep.name, id)
            return null
        }
        return this.remoteRoom
            .lookForAt(LOOK_STRUCTURES, pos)
            .find((s) => s.structureType === STRUCTURE_CONTAINER) as StructureContainer | null
    }

    moveToTarget(): void {
        if (!this.targetPos) {
            Logger.error(
                'remote-hauler:moveToTarget',
                'no target position found',
                this.creep.name,
                this.target,
            )
            return
        }
        moveWithinRoom(this.creep, { pos: this.targetPos, range: 1 })
    }

    goToRemote(): void {
        moveToRoom(this.creep, this.creep.memory.remote)
    }

    goToHome(): void {
        moveToRoom(this.creep, this.creep.memory.home)
    }
}

interface CreateOpts {
    remote: string
    capacity: number
}
const roleRemoteHauler = {
    run: wrap((creep: RemoteHauler) => {
        const remoteHauler = new RemoteHaulerCreep(creep)
        remoteHauler.run()
    }, 'roleHauler:run'),

    create(spawn: StructureSpawn, opts: CreateOpts): number {
        const name = `${ROLE}:${spawn.room.name}:${Game.time}`
        const points = getStationaryPointsMine(opts.remote)
        if (!points) {
            Logger.error('no stationary points found in room', spawn.room.name)
            return ERR_NOT_FOUND
        }
        const sourceIds = Object.keys(points.sources)
        const pickupTracker = {} as Record<Id<Source>, boolean>
        for (const id of sourceIds) {
            pickupTracker[id as Id<Source>] = false
        }
        const err = spawn.spawnCreep(fromBodyPlan(opts.capacity, [CARRY, MOVE]), name, {
            memory: {
                role: ROLE,
                home: spawn.room.name,
                tasks: [],
                idleTimestamp: null,
                remote: opts.remote,
                target: null,
                pickupTracker,
            } as RemoteHaulerMemory,
        })
        return err
    },
}

export default roleRemoteHauler
