import { hasNoSpawns } from "utils/room"
import WarDepartment, { WarStatus } from "war-department"

export default class Empire {
    private rooms: Room[]
    constructor() {
        this.rooms = Object.values(Game.rooms)
    }

    public run(): void {
        for (const room of Object.values(this.rooms)) {
            if (room.controller && room.controller.my && hasNoSpawns(room)) {
                const savior = this.rooms.find((r) => !hasNoSpawns(r) && r.memory.war.status === WarStatus.NONE)
                if (savior) {
                    savior.memory.war = { status: WarStatus.SPAWN, target: room.name }
                }
            }
        }
        for (const room of this.rooms) {
            const warDepartment = new WarDepartment(room)
            warDepartment.update()
        }
    }
}
