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
    readonly room: Room

    constructor(room: Room) {
        this.room = room
        if (!this.room.memory.war) {
            this.room.memory.war = { status: WarStatus.NONE, target: '' }
        }
    }

    static create(roomName: string): WarDepartment {
        const room = Game.rooms[roomName]
        return new WarDepartment(room)
    }

    get warMemory(): WarMemory {
        return this.room.memory.war
    }

    set warMemory(mem: WarMemory) {
        this.room.memory.war = mem
    }

    get status(): WarStatus {
        return this.warMemory.status
    }

    set status(status: WarStatus) {
        this.warMemory.status = status
    }

    get target(): string {
        if (this.status === WarStatus.NONE) {
            throw new Error('this is an invalid value')
        }
        return this.warMemory.target
    }

    update() {
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

    declareWar(target: string) {
        this.warMemory = { status: WarStatus.ATTACK, target }
    }

    claimRoom(target: string) {
        this.warMemory = { status: WarStatus.MINIMAL_CLAIM, target }
    }
}
