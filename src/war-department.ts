import * as Logger from 'utils/logger'
import { getNonObstacleNeighbors } from 'utils/room-position'
import { hasNoSpawns } from 'utils/room'

declare global {
    interface RoomMemory {
        war: WarMemory | SpawnWarMemory
    }
}

export interface WarMemory {
    status: WarStatus
    target: string
    needsProtection?: boolean
}

export interface SpawnWarMemory extends WarMemory {
    status: WarStatus.SPAWN
    type?: 'savior'
}

export enum WarStatus {
    NONE = 'none',
    ATTACK = 'attack',
    CLAIM = 'claim',
    SPAWN = 'spawn',
}

export default class WarDepartment {
    private readonly room: Room

    public constructor(room: Room) {
        this.room = room
        if (!this.room.memory || !this.room.memory.war) {
            this.room.memory.war = { status: WarStatus.NONE, target: '' }
        }
    }

    public get targetRoom(): Room | undefined {
        return Game.rooms[this.target]
    }

    public static create(roomName: string): WarDepartment {
        const room = Game.rooms[roomName]
        return new WarDepartment(room)
    }

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

    public get needsProtection(): boolean {
        return this.warMemory.needsProtection || false
    }

    public hasSafeMode(): boolean {
        return (
            this.targetRoom?.controller?.safeMode !== undefined ||
            (this.targetRoom?.memory.scout?.safeMode ?? 0) +
                (this.targetRoom?.memory.scout?.updatedAt ?? 0) >
                Game.time
        )
    }

    public hasInvaderCore(): boolean {
        const invaderCores = this.targetRoom?.find(FIND_STRUCTURES, {
            filter: { structureType: STRUCTURE_INVADER_CORE },
        })
        return invaderCores ? invaderCores.length > 0 : false
    }

    public hasStrongInvaderCore(): boolean {
        const invaderCores = this.targetRoom?.find(FIND_STRUCTURES, {
            filter: { structureType: STRUCTURE_INVADER_CORE },
        })
        return invaderCores?.some((c) => c.hits > 1000) || false
    }
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
        return hostilePower > 20
    }

    public claimerSpotsAvailable(): number {
        if (!this.targetRoom?.controller) {
            return 0
        }
        return getNonObstacleNeighbors(this.targetRoom.controller.pos).length
    }

    public hasHostileController(): boolean {
        return Boolean(
            this.targetRoom &&
                this.targetRoom.controller &&
                this.targetRoom.controller.owner &&
                this.targetRoom.controller.my === false,
        )
    }

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

    public canMinimallyClaim(): boolean {
        return Boolean(
            !this.needsProtection &&
                this.targetRoom &&
                this.targetRoom.controller &&
                !this.targetRoom.controller.reservation,
        )
    }

    public update(): void {
        if (this.status === WarStatus.NONE) {
            return
        }

        if (this.hasHostiles() || this.hasInvaderCore()) {
            this.warMemory.needsProtection = true
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
                    `war-department:update: switching status from CLAIM to SPAWN for ${this.target}`,
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

    public declareWar(target: string): void {
        this.warMemory = { status: WarStatus.ATTACK, target }
    }

    public cancelWar(): void {
        this.warMemory = { status: WarStatus.NONE, target: '' }
    }

    public claimRoom(target: string): void {
        this.warMemory = { status: WarStatus.CLAIM, target }
    }

    public saveRoom(target: string): void {
        this.warMemory = { status: WarStatus.SPAWN, target, type: 'savior' } as SpawnWarMemory
    }
}
