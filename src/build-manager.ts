import { fromRoom } from 'utils/immutable-room'

export default class BuildManager {
    room: Room

    constructor(room: Room) {
        this.room = room
    }

    createConstructionSite() {
        if (this.room.controller && this.room.controller.level >= 2) {
            const iroom = fromRoom(this.room)
            const pos = iroom.nextExtensionPos()
            this.room.createConstructionSite(pos, STRUCTURE_EXTENSION)
        }
    }
}
