import { OrderedSet, Record as IRecord } from 'immutable'
import { fromRoom, updateCache } from 'utils/immutable-room'

import { EXTENSION_COUNTS, getExtensions } from 'utils/room'

interface IImutableRoomItem {
    x: number
    y: number
}
const CoordinateRecord = IRecord({ x: 0, y: 0 })
class Coordinate extends CoordinateRecord implements IImutableRoomItem {
    readonly x!: number
    readonly y!: number
}

type Roads = OrderedSet<Coordinate>

export default class BuildManager {
    static cache = new Map<string, BuildManager>()
    room: Room
    _roads: Roads | null

    constructor(room: Room) {
        this.room = room
        this._roads = null
    }

    static get(room: Room): BuildManager {
        return new BuildManager(room)
    }

    get roads() {
        if (this._roads === null) {
            this.updateRoadCache()
        }
        return this._roads as Roads
    }

    createConstructionSite(): boolean {
        if (!this.room.controller) {
            return false
        }

        if (this.hasAConstructionSite()) {
            return false
        }

        if (this.canBuildExtension()) {
            return this.buildNextExtension()
        }

        if (this.canBuildSwampRoad()) {
            return this.buildSwampRoad()
        }

        return false
    }

    private hasAConstructionSite() {
        return this.room.find(FIND_CONSTRUCTION_SITES).length > 0
    }

    private canBuildSwampRoad() {
        return this.findSwampRoad() !== undefined
    }

    private buildSwampRoad(): boolean {
        const iroom = fromRoom(this.room)
        const pos = this.findSwampRoad() as RoomPosition
        const ret = this.room.createConstructionSite(pos, STRUCTURE_ROAD)

        updateCache(this.room, iroom.setConstructionSite(pos.x, pos.y, true))
        return ret === OK
    }

    private findSwampRoad(): RoomPosition | undefined {
        const iroom = fromRoom(this.room)
        const pos = this.roads.find(value => {
            const roomItem = iroom.get(value.x, value.y)
            return (
                roomItem.canBuild() &&
                roomItem.terrain === TERRAIN_MASK_SWAMP &&
                !roomItem.hasRoad
            )
        })
        if (!pos) {
            return undefined
        }
        return new RoomPosition(pos.x, pos.y, this.room.name)
    }

    private updateRoadCache() {
        this._roads = OrderedSet()
        if (!this.room.controller) {
            return
        }

        let pathSteps: PathStep[] = []
        const sources: RoomPosition[] = this.room.memory.sources.map(source => {
            const { x, y, roomName } = source.dropSpot.pos
            return new RoomPosition(x, y, roomName)
        })
        const controller = this.room.controller.pos
        const spawns = this.room.find(FIND_MY_SPAWNS).map(spawn => spawn.pos)
        for (const spawn of spawns) {
            for (const source of sources) {
                const path = this.findRoadPath(spawn, source)
                pathSteps = pathSteps.concat(path)
            }
            const path = this.findRoadPath(spawn, controller)
            pathSteps = pathSteps.concat(path)
        }

        for (const source of sources) {
            const path = this.findRoadPath(source, controller)
            pathSteps = pathSteps.concat(path)
        }

        for (const pathStep of pathSteps) {
            const key = new Coordinate({ x: pathStep.x, y: pathStep.y })
            this._roads = this._roads.add(key)
        }
    }

    private findRoadPath(start: RoomPosition, end: RoomPosition) {
        return this.room.findPath(start, end, {
            ignoreCreeps: true,
            swampCost: 1,
        })
    }

    private canBuildExtension() {
        if (!this.room.controller) {
            return false
        }
        const controllerLevel = this.room.controller.level
        const extensions = getExtensions(this.room)
        return EXTENSION_COUNTS[controllerLevel] > extensions.length
    }

    private buildNextExtension(): boolean {
        const iroom = fromRoom(this.room)
        const pos = iroom.nextExtensionPos()
        const ret = this.room.createConstructionSite(pos, STRUCTURE_EXTENSION)
        updateCache(this.room, iroom.setConstructionSite(pos.x, pos.y, true))
        return ret === OK
    }
}

export function getBuildManager(room: Room) {
    return BuildManager.get(room)
}
