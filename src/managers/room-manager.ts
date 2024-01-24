import { extend } from "lodash";
import roleClaimer from 'roles/claim'
import autoIncrement from 'utils/autoincrement'
import * as Logger from 'utils/logger'
import WarDepartment from "war-department";


declare global {
    interface RoomMemory {
        tasks: RoomTask[];
    }
}

interface RoomTask {
    id: number;
    type: "claim" | "long-distance-mine";
    data: object;
    timestamp: number;
}

interface ClaimRoomTask extends RoomTask {
    id: number
    type: "claim"
    data: {
        name: string
    }
    timestamp: number
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
        return this.room.memory.tasks;
    }

    set roomTasks(tasks: RoomTask[]) {
        if (!this.room.memory.tasks) {
            this.room.memory.tasks = []
        }
        this.room.memory.tasks = tasks;
    }

    /**
     * Claims a room.
     * @param room The name of the room to claim.
     */
    public addClaimRoomTask(room: string): void {
        const task: ClaimRoomTask = {
            id: autoIncrement(),
            type: "claim",
            data: {
                name: room
            },
            timestamp: Game.time,
        }

        this.roomTasks.push(task)
    }

    public hasClaimRoomTask(): boolean {
        return this.roomTasks.some(task => task.type === "claim")
    }

    public claimRoom(): boolean {
        const claimTask = this.getClaimRoomTask()
        if (!claimTask) {
            return false;
        }
        const destination = claimTask.data.name
        const spawns = this.room.find(FIND_MY_SPAWNS)
        if (spawns.length === 0) {
            Logger.error('no spawn in starting room')
            return false;
        }
        const err = roleClaimer.create(spawns[0], destination, true)
        if (err === OK) {
            const warDepartment = new WarDepartment(Game.rooms[destination])
            warDepartment.claimRoom(destination)
            Logger.info('RoomManager:claimRoom:war', destination)
        }
        Logger.info('RoomManager:claimRoom:success', destination)
        this.roomTasks = this.roomTasks.filter(task => task.id !== claimTask.id)
        return true
    }

    public getClaimRoomTask(): ClaimRoomTask | undefined {
        return this.roomTasks.find(task => task.type === 'claim') as ClaimRoomTask
    }
}
