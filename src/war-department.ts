import * as Logger from 'utils/logger'

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
    CLAIM = 'claim',
}

export default class WarDepartment {
    readonly room: Room

    constructor(room: Room) {
        this.room = room
        if (!this.room.memory.war) {
            this.room.memory.war = { status: WarStatus.NONE, target: '' }
        }
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

    get target(): string {
        if (this.status === WarStatus.NONE) {
            throw new Error('this is an invalid value')
        }
        return this.warMemory.target
    }

    update() {
        if (this.status !== WarStatus.CLAIM) {
            return
        }

        const targetRoom = Game.rooms[this.target]
        if (!targetRoom) {
            Logger.warning('war-department:update:failure', this.warMemory)
            return
        }

        if (targetRoom.controller && targetRoom.controller.my) {
            this.warMemory = { status: WarStatus.NONE, target: '' }
        }
    }

    declareWar(target: string) {
        this.warMemory = { status: WarStatus.CLAIM, target }
    }
}
