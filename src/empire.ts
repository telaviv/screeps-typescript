import { RoomTask, isClaimRoomTask } from "managers/room-manager"
import { profile } from "utils/profiling"
import { hasNoSpawns } from "utils/room"
import WarDepartment, { WarStatus } from "war-department"
import * as Logger from "utils/logger"

export default class Empire {
    private rooms: Room[]
    constructor() {
        this.rooms = Object.values(Game.rooms)
    }

    @profile
    public run(): void {
        for (const room of this.rooms) {
            if (room.controller && room.controller.my && hasNoSpawns(room)) {
                if (this.rooms.some(
                    (r) => r.memory.war?.status === WarStatus.SPAWN && r.memory.war?.target === room.name)) {
                    continue
                }
                const saviors = this.rooms.filter((r) => !hasNoSpawns(r) && r.memory.war.status === WarStatus.NONE)
                if (saviors.length === 0) {
                    continue
                }
                const savior = saviors.sort(
                    (a, b) => Game.map.getRoomLinearDistance(a.name, room.name) - Game.map.getRoomLinearDistance(b.name, room.name))[0]
                savior.memory.war = { status: WarStatus.SPAWN, target: room.name }
            }
        }
        for (const room of this.rooms) {
            const warDepartment = new WarDepartment(room)
            warDepartment.update()
        }
    }

    public findSavior(room: Room): Room | undefined {
        if (this.getRoomTasks().some((task) => isClaimRoomTask(task) && task.data.name === room.name)) {
            return
        }
        if (this.rooms.some((r) => r.memory.war?.status === WarStatus.SPAWN && r.memory.war?.target === room.name)) {
            return
        }
        const saviors = this.rooms.filter((r) => !hasNoSpawns(r) && r.memory.war.status === WarStatus.NONE && r.controller!.level >= 3)
        const savior = saviors.sort(
            (a, b) => Game.map.getRoomLinearDistance(a.name, room.name) - Game.map.getRoomLinearDistance(b.name, room.name))[0]
        Logger.warning('empire:findSavior', room.name, savior.name)
        return savior
    }

    public getRoomTasks(): RoomTask[] {
        const tasks: RoomTask[] = []
        for (const room of this.rooms) {
            if (room.memory.tasks) {
                tasks.push(...room.memory.tasks)
            }
        }
        return tasks
    }
}
