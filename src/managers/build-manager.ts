import every from 'lodash/every'
import includes from 'lodash/includes'
import { OrderedSet, Record as IRecord } from 'immutable'
import { fromRoom } from 'utils/immutable-room'
import {
    hasContainerAtPosition,
    isAtExtensionCap,
    isAtTowerCap,
    hasConstructionSite,
    getConstructionSites,
    makeConstructionSite,
} from 'utils/room'
import * as Logger from 'utils/logger'
import { getDropSpots } from 'utils/managers'
import RoomSnapshot from 'snapshot'

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
    _snapshot: RoomSnapshot | null

    constructor(room: Room) {
        this.room = room
        this._roads = null
        this._snapshot = null
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

    get snapshot() {
        if (this._snapshot === null) {
            this._snapshot = RoomSnapshot.create(this.room)
        }
        return this._snapshot
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

        if (this.canBuildTower()) {
            return this.buildNextTower()
        }

        if (this.canBuildContainer()) {
            return this.buildNextContainer()
        }

        return false
    }

    canBuildImportant(): boolean {
        return (
            this.hasImportantConstructionSite() ||
            this.canBuildExtension() ||
            this.canBuildSwampRoad() ||
            this.canBuildTower() ||
            this.canBuildContainer()
        )
    }

    private hasImportantConstructionSite(): boolean {
        const sites = getConstructionSites(this.room)
        if (sites.length === 0) {
            return false
        }
        const site = sites[0]
        if (site.structureType === STRUCTURE_ROAD) {
            const result =
                this.room.getTerrain().get(site.pos.x, site.pos.y) ===
                TERRAIN_MASK_SWAMP
            return result
        }
        return !includes(
            [STRUCTURE_WALL, STRUCTURE_RAMPART],
            site.structureType,
        )
    }

    private canBuildContainer() {
        const dropSpots = getDropSpots(this.room)
        return !every(dropSpots, dropSpot =>
            hasContainerAtPosition(this.room, dropSpot.pos),
        )
    }

    private buildNextContainer(): boolean {
        const dropSpots = getDropSpots(this.room)
        for (const dropSpot of dropSpots) {
            if (!hasContainerAtPosition(this.room, dropSpot.pos)) {
                const pos = dropSpot.pos
                return makeConstructionSite(pos, STRUCTURE_CONTAINER) === OK
            }
        }
        return false
    }

    private hasAConstructionSite() {
        return hasConstructionSite(this.room)
    }

    private canBuildTower(): boolean {
        return !isAtTowerCap(this.room)
    }

    private canBuildSwampRoad(): boolean {
        return this.findSwampRoad() !== undefined
    }

    private buildSwampRoad(): boolean {
        const pos = this.findSwampRoad() as RoomPosition
        return makeConstructionSite(pos, STRUCTURE_ROAD) === OK
    }

    private findSwampRoad(): RoomPosition | undefined {
        const iroom = fromRoom(this.room)
        const cachedPos = this.snapshot.findUnbuiltStructurePosition(
            STRUCTURE_ROAD,
            pos => iroom.get(pos.x, pos.y).terrain === TERRAIN_MASK_SWAMP,
        )

        if (cachedPos !== null) {
            Logger.info('build-manager:findSwampRoad:cached', cachedPos)
            return cachedPos
        }

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
        return !isAtExtensionCap(this.room)
    }

    private buildNextTower(): boolean {
        const iroom = fromRoom(this.room)
        const pos = iroom.nextTowerPos()
        return makeConstructionSite(pos, STRUCTURE_TOWER) === OK
    }

    private buildNextExtension(): boolean {
        const iroom = fromRoom(this.room)
        const pos = iroom.nextExtensionPos()
        return makeConstructionSite(pos, STRUCTURE_EXTENSION) === OK
    }
}

export function getBuildManager(room: Room) {
    return BuildManager.get(room)
}
