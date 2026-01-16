import * as Logger from 'utils/logger'
import { HostileRecorder } from 'hostiles'
import { getNonObstacleNeighbors } from 'utils/room-position'
import { hasNoSpawns } from 'utils/room'
import { profile } from 'utils/profiling'

declare global {
    interface RoomMemory {
        war: WarMemory | SpawnWarMemory
    }
    namespace NodeJS {
        interface Global {
            war: { save: (target: string, savior: string) => void }
        }
    }
}
global.war = {
    save: (target: string, savior: string) => {
        const saviorRoom = Game.rooms[savior]
        const targetRoom = Game.rooms[target]
        if (!saviorRoom || !targetRoom) {
            Logger.error(`war:save: room ${target}|${savior} not found`)
            return
        }
        const war = new WarDepartment(saviorRoom)
        war.saveRoom(target)
    },
}

/** Memory structure for tracking war operations */
export interface WarMemory {
    status: WarStatus
    target: string
}

/** Extended war memory for spawn phase operations, optionally marking savior missions */
export interface SpawnWarMemory extends WarMemory {
    status: WarStatus.SPAWN
    type?: 'savior'
}

/**
 * Enum representing the current state of war operations for a room.
 */
export enum WarStatus {
    /** No active war operations */
    NONE = 'none',
    /** Actively attacking a hostile room */
    ATTACK = 'attack',
    /** Claiming a neutral room */
    CLAIM = 'claim',
    /** Spawning creeps to support a target room */
    SPAWN = 'spawn',
}

/**
 * Manages offensive operations, claiming, and savior missions for a room.
 * Tracks war status and provides methods for combat assessment.
 */
export default class WarDepartment {
    private readonly room: Room

    /**
     * @param room - The room managing war operations
     */
    public constructor(room: Room) {
        this.room = room
        if (!this.room.memory || !this.room.memory.war) {
            this.room.memory.war = { status: WarStatus.NONE, target: '' }
        }
    }

    /** Gets the Room object for the war target, if visible */
    public get targetRoom(): Room | undefined {
        return Game.rooms[this.target]
    }

    /**
     * Factory method to create a WarDepartment from a room name.
     * @param roomName - Name of the room to manage
     */
    public static create(roomName: string): WarDepartment {
        const room = Game.rooms[roomName]
        return new WarDepartment(room)
    }

    /** Gets the current war memory for this room */
    public get warMemory(): WarMemory {
        return this.room.memory.war
    }

    private set warMemory(mem: WarMemory) {
        this.room.memory.war = mem
    }

    public get status(): WarStatus {
        return this.warMemory.status
    }

    public set status(status: WarStatus) {
        this.warMemory.status = status
    }

    public get target(): string {
        if (this.status === WarStatus.NONE) {
            throw new Error('this is an invalid value')
        }
        return this.warMemory.target
    }

    /** Checks if the target room needs military protection based on danger level or hostiles */
    public get needsProtection(): boolean {
        if (!this.targetRoom) {
            return false
        }
        const hostileRecorder = new HostileRecorder(this.targetRoom.name)
        const dangerLevel = hostileRecorder.dangerLevel()
        if ((dangerLevel > 0 && dangerLevel < 10) || this.hasHostiles()) {
            return true
        }
        return false
    }

    /** Checks if any creeps in the target room need healing */
    public needsHealing(): boolean {
        if (!this.targetRoom) {
            return false
        }
        const creeps = this.targetRoom.find(FIND_MY_CREEPS)
        return creeps.some((creep) => creep.hits < creep.hitsMax)
    }

    /** Checks if safe mode is active (currently always returns false) */
    public hasSafeMode(): boolean {
        return false
    }

    /** Checks if the target room has an invader core structure */
    public hasInvaderCore(): boolean {
        const invaderCores = this.targetRoom?.find(FIND_STRUCTURES, {
            filter: { structureType: STRUCTURE_INVADER_CORE },
        })
        return invaderCores ? invaderCores.length > 0 : false
    }

    /** Checks if the target room has a reinforced invader core (>1000 hits) */
    public hasStrongInvaderCore(): boolean {
        const invaderCores = this.targetRoom?.find(FIND_STRUCTURES, {
            filter: { structureType: STRUCTURE_INVADER_CORE },
        })
        return invaderCores?.some((c) => c.hits > 1000) || false
    }

    /** Checks if hostile attack power exceeds defensible threshold (>10 parts) */
    public hasOverwhelmingForce(): boolean {
        if (!this.targetRoom?.controller?.my && !this.targetRoom?.controller?.safeMode) {
            return false
        }
        const hostiles = this.targetRoom?.find(FIND_HOSTILE_CREEPS)
        if (!hostiles) {
            return false
        }
        const hostilePower = hostiles.reduce(
            (acc, c) => acc + c.getActiveBodyparts(ATTACK) + c.getActiveBodyparts(RANGED_ATTACK),
            0,
        )
        return hostilePower > 10
    }

    /** Returns the number of available positions adjacent to the controller for claimers */
    public claimerSpotsAvailable(): number {
        if (!this.targetRoom?.controller) {
            return 0
        }
        return getNonObstacleNeighbors(this.targetRoom.controller.pos).length
    }

    /** Checks if the target room's controller is owned by an enemy */
    public hasHostileController(): boolean {
        return Boolean(
            this.targetRoom &&
                this.targetRoom.controller &&
                this.targetRoom.controller.owner &&
                this.targetRoom.controller.my === false,
        )
    }

    /** Checks if the target room has hostile creeps with combat or claim parts */
    public hasHostiles(): boolean {
        const hostiles = this.targetRoom?.find(FIND_HOSTILE_CREEPS)
        return Boolean(
            hostiles &&
                hostiles.some(
                    (c) =>
                        c.getActiveBodyparts(ATTACK) > 0 ||
                        c.getActiveBodyparts(RANGED_ATTACK) > 0 ||
                        c.getActiveBodyparts(CLAIM) > 0,
                ),
        )
    }

    /** Checks if the target room can be claimed without military support */
    public canMinimallyClaim(): boolean {
        return Boolean(
            !this.needsProtection &&
                this.targetRoom &&
                this.targetRoom.controller &&
                !this.targetRoom.controller.reservation,
        )
    }

    /**
     * Updates war status based on current conditions.
     * Transitions between CLAIM->SPAWN->NONE as objectives are met.
     */
    @profile
    public update(): void {
        if (this.status === WarStatus.NONE) {
            return
        }

        if (this.status === WarStatus.CLAIM) {
            if (this.targetRoom && this.targetRoom.controller && this.targetRoom.controller.my) {
                Logger.info(
                    `war-department:update: switching status from CLAIM to SPAWN for ${this.target}`,
                )
                this.status = WarStatus.SPAWN
            }
        } else if (this.status === WarStatus.SPAWN) {
            if (this.targetRoom && !hasNoSpawns(this.targetRoom)) {
                Logger.info(
                    `war-department:update: switching status from SPAWN to NONE for ${this.target}`,
                )
                this.warMemory = { status: WarStatus.NONE, target: '' }
            }
        } else if (this.status === WarStatus.ATTACK) {
            if (this.targetRoom && this.targetRoom.controller && this.targetRoom.controller.my) {
                Logger.warning(
                    `war-department:update: cancelling attack on ${this.target} from ${this.room.name}`,
                )
                this.warMemory = { status: WarStatus.NONE, target: '' }
            }
        }
    }

    /**
     * Initiates an attack operation against a target room.
     * @param target - Name of the room to attack
     */
    public declareWar(target: string): void {
        this.warMemory = { status: WarStatus.ATTACK, target }
    }

    /** Cancels all war operations and resets to NONE status */
    public cancelWar(): void {
        this.warMemory = { status: WarStatus.NONE, target: '' }
    }

    /**
     * Initiates a claim operation for a neutral room.
     * @param target - Name of the room to claim
     */
    public claimRoom(target: string): void {
        this.warMemory = { status: WarStatus.CLAIM, target }
    }

    /**
     * Initiates a savior mission to rebuild a room that lost its spawns.
     * @param target - Name of the room to save
     */
    public saveRoom(target: string): void {
        this.warMemory = { status: WarStatus.SPAWN, target, type: 'savior' } as SpawnWarMemory
    }
}
