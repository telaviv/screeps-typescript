import { hasNoSpawns } from 'utils/room'

declare global {
    interface RoomMemory {
        war: WarMemory
    }
}

interface WarMemory {
    status: WarStatus
    target: string
}

export enum WarStatus {
    NONE = 'none',
    ATTACK = 'attack',
    CLAIM = 'claim',
    MINIMAL_CLAIM = 'minimal-claim',
    SPAWN = 'spawn',
}

export default class WarDepartment {
    private readonly room: Room

    public constructor(room: Room) {
        this.room = room
        if (!this.room.memory.war) {
            this.room.memory.war = { status: WarStatus.NONE, target: '' }
        }
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

    public update() {
        if (this.status === WarStatus.NONE) {
            return
        }
        const targetRoom = Game.rooms[this.target]
        if ([WarStatus.CLAIM, WarStatus.MINIMAL_CLAIM].includes(this.status)) {
            if (
                targetRoom &&
                targetRoom.controller &&
                targetRoom.controller.my
            ) {
                this.status = WarStatus.SPAWN
            }
        } else if (this.status === WarStatus.SPAWN) {
            if (targetRoom && !hasNoSpawns(targetRoom)) {
                this.warMemory = { status: WarStatus.NONE, target: '' }
            }
        }
    }

    public declareWar(target: string) {
        this.warMemory = { status: WarStatus.ATTACK, target }
    }

    public claimRoom(target: string) {
        this.warMemory = { status: WarStatus.MINIMAL_CLAIM, target }
    }
}
