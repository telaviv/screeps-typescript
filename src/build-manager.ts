import { fromRoom } from 'utils/immutable-room'
import { EXTENSION_COUNTS, getExtensions } from 'utils/room'

export default class BuildManager {
    room: Room
    static cache = new Map<string, BuildManager>()

    constructor(room: Room) {
        this.room = room
    }

    static get(room: Room): BuildManager {
        if (this.cache.has(room.name)) {
            return this.cache.get(room.name) as BuildManager
        }
        const buildManager = new BuildManager(room)
        this.cache.set(room.name, buildManager)
        return buildManager
    }

    createConstructionSite(): boolean {
        if (!this.room.controller) {
            return false
        }

        const controllerLevel = this.room.controller.level
        const extensions = getExtensions(this.room)

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

export function getBuildManager(room: Room) {
    return BuildManager.get(room)
}
