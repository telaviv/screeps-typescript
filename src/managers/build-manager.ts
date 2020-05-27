import { stringToInt as hash } from 'utils/hash'
import pokemon from 'utils/pokemon'
import every from 'lodash/every'
import includes from 'lodash/includes'
import { OrderedSet, Record as IRecord } from 'immutable'
import { fromRoom } from 'utils/immutable-room'
import {
    hasContainerAtPosition,
    isAtExtensionCap,
    isAtTowerCap,
    isAtSpawnCap,
    hasNoSpawns,
    hasConstructionSite,
    getConstructionSites,
    makeConstructionSite,
    makeSpawnConstructionSite,
} from 'utils/room'
import * as Logger from 'utils/logger'
import { getDropSpots } from 'utils/managers'
import { wrap, profile } from 'utils/profiling'
import RoomSnapshot from 'snapshot'

declare global {
    interface RoomMemory {
        construction: { paused: boolean }
    }
}

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

        if (!this.room.memory.construction) {
            this.room.memory.construction = { paused: false }
        }
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
            this._snapshot = RoomSnapshot.get(this.room)
        }
        return this._snapshot
    }

    createConstructionSite = wrap((): boolean => {
        if (!this.room.controller) {
            return false
        }

        if (this.room.memory.construction.paused) {
            return false
        }

        if (this.hasAConstructionSite()) {
            return false
        }

        if (this.hasNoSpawns()) {
            return this.buildNextSpawn()
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

        if (this.canBuildSpawn()) {
            return this.buildNextSpawn()
        }

        if (this.canBuildContainer()) {
            return this.buildNextContainer()
        }

        if (this.canBuildWall()) {
            return this.buildNextWall()
        }

        return false
    }, 'BuildManager:createConstructionSite')

    canBuildImportant = wrap((): boolean => {
        return (
            this.hasImportantConstructionSite() ||
            this.canBuildExtension() ||
            this.canBuildSwampRoad() ||
            this.canBuildTower() ||
            this.canBuildContainer() ||
            this.canBuildSpawn()
        )
    }, 'BuildManager:canBuildImportant')

    private hasImportantConstructionSite = wrap((): boolean => {
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
    }, 'BuildManager:hasImportantConstructionSite')

    private canBuildContainer = wrap(() => {
        const dropSpots = getDropSpots(this.room)
        return !every(dropSpots, dropSpot =>
            hasContainerAtPosition(this.room, dropSpot.pos),
        )
    }, 'BuildManager:canBuildContainer')

    private buildNextContainer = wrap((): boolean => {
        let pos = this.snapshot.getStructurePos(STRUCTURE_CONTAINER)

        if (pos !== null) {
            Logger.info('build-manager:buildNextContainer:cached', pos)
        } else {
            const dropSpots = getDropSpots(this.room)
            for (const dropSpot of dropSpots) {
                if (!hasContainerAtPosition(this.room, dropSpot.pos)) {
                    pos = dropSpot.pos
                }
            }
        }
        if (pos !== null) {
            return makeConstructionSite(pos, STRUCTURE_CONTAINER) === OK
        }
        return false
    }, 'BuildManager:buildNextContainer')

    private hasAConstructionSite = wrap(() => {
        return hasConstructionSite(this.room)
    }, 'BuildManager:hasAConstructionSite')

    private hasNoSpawns() {
        return hasNoSpawns(this.room)
    }

    private canBuildSpawn() {
        return !isAtSpawnCap(this.room)
    }

    private buildNextSpawn() {
        let pos = this.snapshot.getStructurePos(STRUCTURE_SPAWN)

        if (pos !== null) {
            Logger.info('build-manager:buildNextSpawn:cached', pos)
        } else {
            const iroom = fromRoom(this.room)
            pos = iroom.nextSpawnPos()
        }
        return makeSpawnConstructionSite(pos, pokemon()) === OK
    }

    private canBuildTower = wrap((): boolean => {
        return !isAtTowerCap(this.room)
    }, 'BuildManager:canBuildTower')

    private canBuildSwampRoad = wrap((): boolean => {
        if (Game.time % 100 !== Math.abs(hash(this.room.name) % 100)) {
            return false
        }
        const startCpu = Game.cpu.getUsed()
        const ret = this.findSwampRoad() !== undefined
        const stopCpu = Game.cpu.getUsed()
        Logger.info(
            'canBuildSwampRoad:finished',
            this.room.name,
            stopCpu - startCpu,
            ret,
        )
        return ret
    }, 'BuildManager:canBuildSwampRoad')

    private buildSwampRoad = wrap((): boolean => {
        const pos = this.findSwampRoad() as RoomPosition
        return makeConstructionSite(pos, STRUCTURE_ROAD) === OK
    }, 'BuildManager:buildSwampRoad')

    @profile
    private findSwampRoad(): RoomPosition | undefined {
        const iroom = fromRoom(this.room)
        const cachedPos = this.snapshot.getStructurePos(
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
                !roomItem.nonObstacles.road
            )
        })
        if (!pos) {
            return undefined
        }
        return new RoomPosition(pos.x, pos.y, this.room.name)
    }

    private updateRoadCache = wrap(() => {
        this._roads = OrderedSet()
        if (!this.room.controller || !this.room.memory.sources) {
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
    }, 'BuildManager:updateRoadCache')

    private findRoadPath(start: RoomPosition, end: RoomPosition) {
        return this.room.findPath(start, end, {
            ignoreCreeps: true,
            swampCost: 1,
        })
    }

    private canBuildExtension = wrap(() => {
        return !isAtExtensionCap(this.room)
    }, 'BuildManager:canBuildExtension')

    private buildNextExtension = wrap((): boolean => {
        let pos = this.snapshot.getStructurePos(STRUCTURE_EXTENSION)

        if (pos !== null) {
            Logger.info('build-manager:buildNextExtension:cached', pos)
        } else {
            const iroom = fromRoom(this.room)
            pos = iroom.nextExtensionPos()
        }

        return makeConstructionSite(pos, STRUCTURE_EXTENSION) === OK
    }, 'BuildManager:buildNextExtension')

    private buildNextTower(): boolean {
        let pos = this.snapshot.getStructurePos(STRUCTURE_TOWER)

        if (pos !== null) {
            Logger.info('build-manager:buildNextTower:cached', pos)
        } else {
            const iroom = fromRoom(this.room)
            pos = iroom.nextTowerPos()
        }

        return makeConstructionSite(pos, STRUCTURE_TOWER) === OK
    }

    private canBuildWall = wrap((): boolean => {
        return (
            this.snapshot.hasStructure(STRUCTURE_RAMPART) ||
            this.snapshot.hasStructure(STRUCTURE_WALL)
        )
    }, 'BuildManager:canBuildWall')

    private buildNextWall = wrap((): boolean => {
        let pos = this.snapshot.getStructurePos(STRUCTURE_RAMPART)
        if (pos !== null) {
            return makeConstructionSite(pos, STRUCTURE_RAMPART) === OK
        }

        pos = this.snapshot.getStructurePos(STRUCTURE_WALL)
        if (pos !== null) {
            return makeConstructionSite(pos, STRUCTURE_WALL) === OK
        }
        Logger.warning('buildNextWall:failure', this.snapshot)
        return false
    }, 'BuildManager:buildNextWall')
}

export function getBuildManager(room: Room) {
    return BuildManager.get(room)
}
