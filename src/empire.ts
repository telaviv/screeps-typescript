import { hasNoSpawns } from "utils/room"
import WarDepartment, { WarStatus } from "war-department"

export default class Empire {
    private rooms: Room[]
    constructor() {
        this.rooms = Object.values(Game.rooms)
    }

    public run(): void {
        for (const room of this.rooms) {
            if (room.controller && room.controller.my && hasNoSpawns(room)) {
                if (this.rooms.some((r) => r.memory.war.status === WarStatus.SPAWN && r.memory.war.target === room.name)) {
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
}
