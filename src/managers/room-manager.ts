import * as Logger from 'utils/logger'
import WarDepartment from 'war-department'
import autoIncrement from 'utils/autoincrement'
import roleClaimer from 'roles/claim'
import roleScout from 'roles/scout'

declare global {
    interface RoomMemory {
        /** Queue of room-level tasks */
        tasks: RoomTask[]
    }
}

/** Base interface for room-level tasks */
export interface RoomTask {
    /** Unique task identifier */
    id: number
    /** Type of task */
    type: 'claim' | 'long-distance-mine' | 'scout'
    /** Task-specific data */
    data: Record<string, unknown>
    /** Game tick when task was created */
    timestamp: number
}

/** Task to claim a new room */
interface ClaimRoomTask extends RoomTask {
    id: number
    type: 'claim'
    data: {
        /** Name of the room to claim */
        name: string
    }
    timestamp: number
}

/** Task to scout a room */
interface ScoutRoomTask extends RoomTask {
    id: number
    type: 'scout'
    data: {
        /** Name of the room to scout */
        room: string
    }
    timestamp: number
}

/**
 * Type guard for claim room tasks.
 * @param task - The task to check
 */
export const isClaimRoomTask = (task: RoomTask): task is ClaimRoomTask => {
    return task.type === 'claim'
}

/**
 * Type guard for scout room tasks.
 * @param task - The task to check
 */
export const isScoutRoomTask = (task: RoomTask): task is ScoutRoomTask => {
    return task.type === 'scout'
}

/**
 * Manages room-level tasks like claiming and scouting.
 * Coordinates task creation and execution.
 */
export class RoomManager {
    /** The room being managed */
    private room: Room

    /**
     * Creates a new RoomManager.
     * @param room - The room to manage
     */
    constructor(room: Room) {
        this.room = room
    }

    /** Gets all scout tasks from all rooms */
    static getAllScoutTasks(): ScoutRoomTask[] {
        return Object.values(Game.rooms).reduce((acc, room) => {
            const roomManager = new RoomManager(room)
            return acc.concat(roomManager.getScoutRoomTasks())
        }, [] as ScoutRoomTask[])
    }

    /** Gets all claim tasks from all rooms */
    static getAllClaimTasks(): ClaimRoomTask[] {
        return Object.values(Game.rooms).reduce((acc, room) => {
            const roomManager = new RoomManager(room)
            return acc.concat(roomManager.getClaimRoomTasks())
        }, [] as ClaimRoomTask[])
    }

    /** Gets the room's task queue */
    get roomTasks(): RoomTask[] {
        if (!this.room.memory.tasks) {
            this.room.memory.tasks = []
        }
        return this.room.memory.tasks
    }

    /** Sets the room's task queue */
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

    /** Checks if the room can initiate a claim operation */
    public canClaimRoom(): boolean {
        const roomsOwned = Object.keys(Game.rooms).filter(
            (roomName) => Game.rooms[roomName].controller?.my,
        )
        if (roomsOwned.length >= Game.gcl.level) {
            return false
        }
        return this.hasClaimRoomTask() && roleClaimer.canCreate(this.room.find(FIND_MY_SPAWNS)[0])
    }

    /** Checks if the room has a pending claim task */
    public hasClaimRoomTask(): boolean {
        return this.roomTasks.some((task) => task.type === 'claim')
    }

    /** Gets all scout tasks for this room */
    public getScoutRoomTasks(): ScoutRoomTask[] {
        return this.roomTasks.filter((task) => task.type === 'scout') as ScoutRoomTask[]
    }

    /** Gets all claim tasks for this room */
    public getClaimRoomTasks(): ClaimRoomTask[] {
        return this.roomTasks.filter((task) => task.type === 'claim') as ClaimRoomTask[]
    }

    /** Initiates a room claim operation via the war department */
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
        if (err === OK) {
            warDepartment.claimRoom(destination)
            Logger.info('RoomManager:claimRoom:success', destination)
            this.roomTasks = this.roomTasks.filter((task) => task.id !== claimTask.id)
            return true
        }
        return false
    }

    /** Creates a scout creep for the first scout task */
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

    /** Gets the first claim task in the queue */
    public getClaimRoomTask(): ClaimRoomTask | undefined {
        return this.roomTasks.find((task) => task.type === 'claim') as ClaimRoomTask
    }
}
