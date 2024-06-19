import { extend } from 'lodash'
import roleClaimer from 'roles/claim'
import roleScout from 'roles/scout'
import autoIncrement from 'utils/autoincrement'
import * as Logger from 'utils/logger'
import WarDepartment from 'war-department'

declare global {
    interface RoomMemory {
        tasks: RoomTask[]
    }
}

export interface RoomTask {
    id: number
    type: 'claim' | 'long-distance-mine'
    data: Record<string, unknown>
    timestamp: number
}

interface ClaimRoomTask extends RoomTask {
    id: number
    type: 'claim'
    data: {
        name: string
    }
    timestamp: number
}

export const isClaimRoomTask = (task: RoomTask): task is ClaimRoomTask => {
    return task.type === 'claim'
}

export class RoomManager {
    private room: Room

    constructor(room: Room) {
        this.room = room
    }

    get roomTasks(): RoomTask[] {
        if (!this.room.memory.tasks) {
            this.room.memory.tasks = []
        }
        return this.room.memory.tasks
    }

    set roomTasks(tasks: RoomTask[]) {
        if (!this.room.memory.tasks) {
            this.room.memory.tasks = []
        }
        this.room.memory.tasks = tasks
    }

    /**
     * Claims a room.
     * @param room The name of the room to claim.
     */
    public addClaimRoomTask(room: string): void {
        const task: ClaimRoomTask = {
            id: autoIncrement(),
            type: 'claim',
            data: {
                name: room,
            },
            timestamp: Game.time,
        }

        this.roomTasks.push(task)
    }

    public canClaimRoom(): boolean {
        const roomsOwned = Object.keys(Game.rooms).filter(
            (roomName) => Game.rooms[roomName].controller?.my,
        )
        if (roomsOwned.length >= Game.gcl.level) {
            return false
        }
        return this.hasClaimRoomTask() && roleClaimer.canCreate(this.room.find(FIND_MY_SPAWNS)[0])
    }

    public hasClaimRoomTask(): boolean {
        return this.roomTasks.some((task) => task.type === 'claim')
    }

    public claimRoom(): boolean {
        const claimTask = this.getClaimRoomTask()
        const warDepartment = new WarDepartment(this.room)
        if (!claimTask || warDepartment.status !== 'none') {
            return false
        }
        const destination = claimTask.data.name
        const spawns = this.room.find(FIND_MY_SPAWNS)
        if (spawns.length === 0) {
            Logger.error('no spawn in starting room')
            return false
        }
        const err = roleScout.create(spawns[0], destination, { dryRun: true })
        if (err === OK) {
            warDepartment.claimRoom(destination)
            Logger.info('RoomManager:claimRoom:success', destination)
            this.roomTasks = this.roomTasks.filter((task) => task.id !== claimTask.id)
            return true
        }
        return false
    }

    public getClaimRoomTask(): ClaimRoomTask | undefined {
        return this.roomTasks.find((task) => task.type === 'claim') as ClaimRoomTask
    }
}
