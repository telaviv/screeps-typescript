import { hasNoSpawns } from 'utils/room'

declare global {
    interface RoomMemory {
        war: WarMemory
    }
}

export interface WarMemory {
    status: WarStatus
    target: string
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

    public set warMemory(mem: WarMemory) {
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

    public hasInvaderCore(): boolean {
        const invaderCores = this.targetRoom?.find(FIND_STRUCTURES, {
            filter: { structureType: STRUCTURE_INVADER_CORE },
        })
        return invaderCores ? invaderCores.length > 0 : false
    }

    public hasHostiles(): boolean {
        const hostiles = this.targetRoom?.find(FIND_HOSTILE_CREEPS)
        return hostiles ? hostiles.length > 0 : false
    }

    public update(): void {
        if (this.status === WarStatus.NONE) {
            return
        }
        if (this.status === WarStatus.CLAIM) {
            if (this.targetRoom && this.targetRoom.controller && this.targetRoom.controller.my) {
                this.status = WarStatus.SPAWN
            }
        } else if (this.status === WarStatus.SPAWN) {
            if (this.targetRoom && !hasNoSpawns(this.targetRoom)) {
                this.warMemory = { status: WarStatus.NONE, target: '' }
            }
        } else if (this.status === WarStatus.ATTACK) {
            if (!this.hasHostiles() && !this.hasInvaderCore()) {
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
}
