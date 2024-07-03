import * as Logger from 'utils/logger'
import WarDepartment from 'war-department'
import autoIncrement from 'utils/autoincrement'
import roleClaimer from 'roles/claim'
import roleScout from 'roles/scout'

declare global {
    interface RoomMemory {
        tasks: RoomTask[]
    }
}

export interface RoomTask {
    id: number
    type: 'claim' | 'long-distance-mine' | 'scout'
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

interface ScoutRoomTask extends RoomTask {
    id: number
    type: 'scout'
    data: {
        room: string
    }
    timestamp: number
}

export const isClaimRoomTask = (task: RoomTask): task is ClaimRoomTask => {
    return task.type === 'claim'
}

export const isScoutRoomTask = (task: RoomTask): task is ScoutRoomTask => {
    return task.type === 'scout'
}

export class RoomManager {
    private room: Room

    constructor(room: Room) {
        this.room = room
    }

    static getAllScoutTasks(): ScoutRoomTask[] {
        return Object.values(Game.rooms).reduce((acc, room) => {
            const roomManager = new RoomManager(room)
            return acc.concat(roomManager.getScoutRoomTasks())
        }, [] as ScoutRoomTask[])
    }

    static getAllClaimTasks(): ClaimRoomTask[] {
        return Object.values(Game.rooms).reduce((acc, room) => {
            const roomManager = new RoomManager(room)
            return acc.concat(roomManager.getClaimRoomTasks())
        }, [] as ClaimRoomTask[])
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
        console.log('addClaimRoomTask', room)
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

    /**
     * Adds a scout task.
     * @param room The name of the room to scout.
     */
    public addScoutRoomTask(room: string): void {
        const task: ScoutRoomTask = {
            id: autoIncrement(),
            type: 'scout',
            data: {
                room,
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

    public getScoutRoomTasks(): ScoutRoomTask[] {
        return this.roomTasks.filter((task) => task.type === 'scout') as ScoutRoomTask[]
    }

    public getClaimRoomTasks(): ClaimRoomTask[] {
        return this.roomTasks.filter((task) => task.type === 'claim') as ClaimRoomTask[]
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
        const err = roleScout.create(spawns[0], destination, false, { dryRun: true })
        Logger.error('RoomManager:claimRoom:scout:create', err)
        if (err === OK) {
            warDepartment.claimRoom(destination)
            Logger.info('RoomManager:claimRoom:success', destination)
            this.roomTasks = this.roomTasks.filter((task) => task.id !== claimTask.id)
            return true
        }
        return false
    }

    public scoutRoom(): boolean {
        const scoutTask = this.getScoutRoomTasks()[0]
        if (!scoutTask) {
            return false
        }
        const destination = scoutTask.data.room
        const spawns = this.room.find(FIND_MY_SPAWNS)
        if (spawns.length === 0) {
            Logger.error('no spawn in starting room')
            return false
        }
        const err = roleScout.create(spawns[0], destination)
        Logger.info('RoomManager:scoutRoom:create', err)
        if (err === OK) {
            this.roomTasks = this.roomTasks.filter((task) => task.id !== scoutTask.id)
            return true
        }
        return false
    }

    public getClaimRoomTask(): ClaimRoomTask | undefined {
        return this.roomTasks.find((task) => task.type === 'claim') as ClaimRoomTask
    }
}
