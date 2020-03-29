import { fromRoom } from 'utils/immutable-room'

const EXTENSION_COUNTS = [0, 0, 5, 10, 20, 30, 40, 50, 60]

export default class BuildManager {
    room: Room

    constructor(room: Room) {
        this.room = room
    }

    createConstructionSite(): boolean {
        if (!this.room.controller) {
            return false
        }

        const controllerLevel = this.room.controller.level
        const extensions = this.room.find(FIND_STRUCTURES, {
            filter: { structureType: STRUCTURE_EXTENSION },
        })

        if (EXTENSION_COUNTS[controllerLevel] > extensions.length) {
            const iroom = fromRoom(this.room)
            const pos = iroom.nextExtensionPos()
            const ret = this.room.createConstructionSite(
                pos,
                STRUCTURE_EXTENSION,
            )
            return ret === OK
        }
        return false
    }
}
