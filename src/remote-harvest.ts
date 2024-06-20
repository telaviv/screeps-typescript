import { WarMemory, WarStatus } from 'war-department'
import { hasNoSpawns } from 'utils/room'

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

    update(): void {
        if (this.status === WarStatus.NONE) {
            return
        }
        const targetRoom = Game.rooms[this.target]
        if (this.status === WarStatus.CLAIM) {
            if (targetRoom && targetRoom.controller && targetRoom.controller.my) {
                this.status = WarStatus.SPAWN
            }
        } else if (this.status === WarStatus.SPAWN) {
            if (targetRoom && !hasNoSpawns(targetRoom)) {
                this.warMemory = { status: WarStatus.NONE, target: '' }
            }
        }
    }

    declareWar(target: string): void {
        this.warMemory = { status: WarStatus.ATTACK, target }
    }

    claimRoom(target: string): void {
        this.warMemory = { status: WarStatus.CLAIM, target }
    }
}
