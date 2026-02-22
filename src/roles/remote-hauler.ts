import * as Logger from 'utils/logger'
import * as Logistics from './logistics'
import { ResourceCreep, ResourceCreepMemory } from 'tasks/types'
import { fromBodyPlan } from 'utils/parts'
import {
    MinePathEntry,
    getConstructionFeatures,
    getMinePaths,
    getStationaryPointsMine,
} from 'construction-features'
import { getVirtualStorage } from '../utils/virtual-storage'
import { hasNoEnergy } from 'utils/energy-harvesting'
import { hasNoSpawns } from 'utils/room'
import {
    LogisticsCreep,
    LogisticsMemory,
    PREFERENCE_WORKER,
    TASK_COLLECTING,
    TASK_HAULING,
} from './logistics-constants'
import { isMineTravel, moveToRoom, moveToRoomForMineTravel, moveWithinRoom } from 'utils/travel'
import {
    followMinePath,
    getSourcePathKey,
    getSourceToSourceKey,
    isSourceToSourceReversed,
    reverseMinePath,
} from 'utils/mine-travel'
import { profile, wrap } from 'utils/profiling'

declare global {
    interface Memory {
        remoteHaulerDebugEnabled?: boolean
    }
}

const ROLE = 'remote-hauler'

export interface RemoteHauler extends ResourceCreep {
    memory: RemoteHaulerMemory | LogisticsMemory
    storageTransfered: boolean
}

export interface RemoteHaulerMemory extends ResourceCreepMemory {
    role: 'remote-hauler'
    home: string
    remote: string
    target: Id<Source> | null
    pickupTracker: Record<Id<Source>, boolean>
}

function isRemoteHaulerMemory(
    memory: ResourceCreepMemory | LogisticsMemory,
): memory is RemoteHaulerMemory {
    return memory.role === 'remote-hauler'
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
        return this.creep.memory as RemoteHaulerMemory
    }

    get target(): Id<Source> | null {
        return this.memory.target
    }

    get currentRoom(): Room {
        return this.creep.room
    }

    get remoteRoom(): Room {
        return Game.rooms[this.memory.remote]
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

        // If memory has already been transformed, don't run remote hauler logic
        if (!isRemoteHaulerMemory(this.creep.memory)) {
            return
        }

        // If remote room is now owned, transform to logistics creep
        if (this.shouldTransform()) {
            this.transform()
            return
        }

        // If stationary points are missing for the remote room, mark and bail
        const points = getStationaryPointsMine(this.memory.remote)
        if (!points) {
            console.log(
                'remote-hauler:run:no-stationary-points (would suicide)',
                this.creep.name,
                this.creep.pos,
                this.memory.remote,
            )
            this.creep.say('no-pts')
            return
        }

        const freeCapacity = this.creep.store.getFreeCapacity()
        const isHome = this.creep.room.name === this.memory.home
        const isRemote = this.creep.room.name === this.memory.remote
        const target = this.memory.target

        if (Memory.remoteHaulerDebugEnabled) {
            console.log(
                'remote-hauler:debug',
                this.creep.name,
                this.creep.pos,
                `isHome=${isHome}`,
                `isRemote=${isRemote}`,
                `freeCapacity=${freeCapacity}`,
                `target=${target}`,
                `allPickupsFree=${this.allPickupsFree()}`,
                `allPickupsComplete=${this.allPickupsComplete()}`,
            )
        }

        if (isHome && this.allPickupsFree()) {
            if (this.creep.ticksToLive && this.creep.ticksToLive < 75) {
                Logger.warning(
                    'remote-hauler:run:ttl-low:suicide',
                    this.creep.name,
                    this.creep.pos,
                    `ttl=${this.creep.ticksToLive}`,
                )
                this.creep.suicide()
                return
            }
            this.goToRemote()
            return
        } else if (isHome && (this.allPickupsComplete() || freeCapacity === 0)) {
            this.dropOff()
        } else if (isRemote && (this.allPickupsComplete() || freeCapacity === 0)) {
            this.goToHome()
        } else if (isHome && target) {
            // Creep drifted back to home with partial pickups and a remote target — head back.
            this.goToRemote()
        } else if (!target) {
            this.getTarget()
        } else if (this.canPickup()) {
            this.pickup()
        } else {
            this.moveToTarget()
        }
    }

    private shouldTransform(): boolean {
        const remoteRoom = Game.rooms[this.memory.remote]
        return remoteRoom && !hasNoSpawns(remoteRoom) && remoteRoom.controller?.my === true
    }

    private transform(): void {
        const hasWorkParts = this.creep.getActiveBodyparts(WORK) > 0
        const currentTask = hasNoEnergy(this.creep) ? TASK_COLLECTING : TASK_HAULING
        const preference = hasWorkParts ? PREFERENCE_WORKER : TASK_HAULING

        Logger.info(
            'remote-hauler:transform',
            this.creep.name,
            this.memory.remote,
            hasWorkParts ? 'worker' : 'hauler',
        )

        const memory: LogisticsMemory = {
            role: Logistics.ROLE,
            home: this.memory.remote,
            preference,
            currentTask,
            currentTarget: undefined,
            idleTimestamp: null,
            tasks: [],
        }
        this.creep.memory = memory
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
                this.memory.remote,
            )
            return 0
        }
        const container = this.getContainerTarget(id)
        const droppedEnergy = this.getPickupTarget(id)?.amount ?? 0
        return (container?.store.getUsedCapacity(RESOURCE_ENERGY) ?? 0) + droppedEnergy
    }

    getPositionFromSourceId(id: Id<Source>): RoomPosition | null {
        const points = getStationaryPointsMine(this.memory.remote)
        if (!points) {
            Logger.error(
                'remote-hauler:getPositionFromSourceId:no-stationary-points',
                this.creep.name,
                this.memory.remote,
            )
            return null
        }
        const pos = points.sources[id]
        if (!pos) {
            Logger.error(
                'remote-hauler:getPositionFromSourceId:no-id-in-sources',
                this.creep.name,
                this.memory.remote,
                points.sources,
            )
            return null
        }
        return new RoomPosition(pos.x, pos.y, this.memory.remote)
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
        const virtualStorage = getVirtualStorage(this.memory.home)
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

    getLastPickedSourceId(): Id<Source> | null {
        const picked = Object.entries(this.memory.pickupTracker).filter(([, done]) => done)
        if (picked.length === 0) return null
        return picked[picked.length - 1][0] as Id<Source>
    }

    @profile
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

        const target = this.target
        if (isMineTravel(this.memory.home, this.memory.remote) && target) {
            const minePaths = getMinePaths(this.memory.remote)

            // Try source-to-source path if we already picked up from another source
            const lastPicked = this.getLastPickedSourceId()
            if (lastPicked && lastPicked !== target) {
                const key = getSourceToSourceKey(this.memory.remote, lastPicked, target)
                const s2sPath = minePaths?.[key]
                if (s2sPath && s2sPath.length > 0) {
                    const ordered = isSourceToSourceReversed(lastPicked, target)
                        ? reverseMinePath(s2sPath)
                        : s2sPath
                    const result = followMinePath(this.creep, ordered, 's2s')
                    if (result === OK || result === ERR_TIRED) return
                }
            }

            // Use the pre-calculated storage→source path (mine room segment)
            const fullPath = minePaths?.[getSourcePathKey(this.memory.remote, target)]
            if (fullPath && fullPath.length > 0) {
                const result = followMinePath(this.creep, fullPath, 'moveToTarget')
                if (result === OK || result === ERR_TIRED) return
            }
        }

        if (Memory.remoteHaulerDebugEnabled) {
            console.log(
                'remote-hauler:moveToTarget:fallback',
                this.creep.name,
                this.creep.pos,
                this.targetPos,
            )
        }
        moveWithinRoom(this.creep, { pos: this.targetPos, range: 1 })
    }

    /** Moves toward the nearest step of `path` that lies in the creep's current room. */
    moveTowardPath(path: MinePathEntry[]): void {
        const roomName = this.creep.room.name
        const firstInRoom = path.find((s) => s.roomName === roomName)
        if (firstInRoom) {
            if (Memory.remoteHaulerDebugEnabled) {
                console.log(
                    'remote-hauler:moveTowardPath',
                    this.creep.name,
                    this.creep.pos,
                    `→(${firstInRoom.x},${firstInRoom.y},${firstInRoom.roomName})`,
                )
            }
            moveWithinRoom(this.creep, {
                pos: new RoomPosition(firstInRoom.x, firstInRoom.y, roomName),
                range: 0,
            })
        }
    }

    @profile
    goToRemote(): void {
        if (isMineTravel(this.memory.home, this.memory.remote)) {
            const sourceId = Object.keys(this.memory.pickupTracker)[0] as Id<Source> | undefined
            if (sourceId) {
                const fullPath = getMinePaths(this.memory.remote)?.[
                    getSourcePathKey(this.memory.remote, sourceId)
                ]
                if (fullPath && fullPath.length > 0) {
                    const result = followMinePath(this.creep, fullPath, 'goToRemote')
                    if (result === OK || result === ERR_TIRED) return
                    // Not on path — walk to the nearest road tile in this room
                    if (Memory.remoteHaulerDebugEnabled) {
                        console.log(
                            'remote-hauler:goToRemote:fallback',
                            this.creep.name,
                            this.creep.pos,
                        )
                    }
                    this.moveTowardPath(fullPath)
                    return
                }
            }
            moveToRoomForMineTravel(this.creep, this.memory.remote)
        } else {
            moveToRoom(this.creep, this.memory.remote)
        }
    }

    @profile
    goToHome(): void {
        if (isMineTravel(this.memory.home, this.memory.remote)) {
            const sourceId =
                this.getLastPickedSourceId() ??
                (Object.keys(this.memory.pickupTracker)[0] as Id<Source> | undefined)
            if (sourceId) {
                const fullPath = getMinePaths(this.memory.remote)?.[
                    getSourcePathKey(this.memory.remote, sourceId)
                ]
                if (fullPath && fullPath.length > 0) {
                    const reversed = reverseMinePath(fullPath)
                    const result = followMinePath(this.creep, reversed, 'goToHome')
                    if (result === OK || result === ERR_TIRED) return
                    // Not on path — walk to the nearest road tile in this room
                    if (Memory.remoteHaulerDebugEnabled) {
                        console.log(
                            'remote-hauler:goToHome:fallback',
                            this.creep.name,
                            this.creep.pos,
                        )
                    }
                    this.moveTowardPath(reversed)
                    return
                }
            }
            moveToRoomForMineTravel(this.creep, this.memory.home)
        } else {
            moveToRoom(this.creep, this.memory.home)
        }
    }
}

interface CreateOpts {
    remote: string
    capacity: number
    roadsBuilt: boolean
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
        const blueprint = opts.roadsBuilt ? [CARRY, CARRY, MOVE] : [CARRY, MOVE]
        const err = spawn.spawnCreep(fromBodyPlan(opts.capacity, blueprint), name, {
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
