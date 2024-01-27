import RoomPlanner from 'room-planner'
import RoomSnapshot from 'snapshot'
import { stringToInt as hash } from 'utils/hash'
import pokemon from 'utils/pokemon'
import every from 'lodash/every'
import includes from 'lodash/includes'
import { Record as IRecord, OrderedSet } from 'immutable'
import { fromRoom } from 'utils/immutable-room'
import {
    getConstructionSites,
    getLinks,
    hasConstructionSite,
    hasContainerAtPosition,
    hasNoSpawns,
    hasStorage,
    hasStructureAt,
    isAtExtensionCap,
    isAtSpawnCap,
    isAtTowerCap,
    makeConstructionSite,
    makeSpawnConstructionSite,
} from 'utils/room'
import * as Logger from 'utils/logger'
import { getDropSpots } from 'utils/managers'
import { profile, wrap } from 'utils/profiling'

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

    @profile
    ensureConstructionSites(): boolean {
        const nonWall = this.ensureNonWallSite()
        const wall = this.ensureWallSite()
        return nonWall || wall
    }

    private ensureWallSite(): boolean {
        if (!this.room.controller) {
            return false
        }

        if (this.room.memory.construction.paused) {
            return false
        }

        if (this.hasWallSite()) {
            return false
        }

        if (this.canBuildWall()) {
            return this.buildNextWall()
        }

        return false
    }

    private ensureNonWallSite(): boolean {
        if (!this.room.controller) {
            return false
        }

        if (this.room.memory.construction.paused) {
            return false
        }

        if (this.hasNonWallSite()) {
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

        if (this.canBuildStorage()) {
            return this.buildNextStorage()
        }

        if (this.canBuildLinks()) {
            return this.buildNextLink()
        }

        return false
    }

    canBuildImportant = wrap((): boolean => {
        return (
            this.hasImportantConstructionSite() ||
            this.canBuildExtension() ||
            this.canBuildSwampRoad() ||
            this.canBuildTower() ||
            this.canBuildContainer() ||
            this.canBuildSpawn() ||
            this.canBuildStorage() ||
            this.canBuildLinks()
        )
    }, 'BuildManager:canBuildImportant')

    private hasImportantConstructionSite = wrap((): boolean => {
        const sites = getConstructionSites(this.room)
        if (sites.length === 0) {
            return false
        }
        const site = sites[0]
        if (site.structureType === STRUCTURE_ROAD) {
            const terrain = this.room.getTerrain().get(site.pos.x, site.pos.y)
            return (
                terrain === TERRAIN_MASK_SWAMP || terrain === TERRAIN_MASK_WALL
            )
        }
        return !includes(
            [STRUCTURE_WALL, STRUCTURE_RAMPART],
            site.structureType,
        )
    }, 'BuildManager:hasImportantConstructionSite')

    private canBuildContainer = wrap(() => {
        const dropSpots = getDropSpots(this.room)
        return !every(dropSpots, (dropSpot) =>
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

    private canBuildLinks = wrap(() => {
        const LINK_LEVELS = [0, 0, 0, 0, 0, 2, 3, 4, 6]
        const roomPlanner = new RoomPlanner(this.room)
        const links = getLinks(this.room)
        const linkLevel = LINK_LEVELS[this.room.controller!.level]!
        return !!(
            roomPlanner.planIsFinished() &&
            this.room.controller &&
            linkLevel > 0 &&
            linkLevel > links.length
        )
    }, 'BuildManager:canBuildLinks')

    @profile
    private buildNextLink(): boolean {
        const roomPlanner = new RoomPlanner(this.room)
        const controllerLink = roomPlanner.plan.links.controller!
        if (
            !hasStructureAt(
                STRUCTURE_LINK,
                this.room,
                controllerLink.x,
                controllerLink.y,
            )
        ) {
            const { x, y, roomName } = controllerLink
            const pos = new RoomPosition(x, y, roomName)
            return makeConstructionSite(pos, STRUCTURE_LINK) === OK
        }

        for (const sourceLink of Object.values(roomPlanner.links.sources)) {
            if (
                !hasStructureAt(
                    STRUCTURE_LINK,
                    this.room,
                    sourceLink.x,
                    sourceLink.y,
                )
            ) {
                const { x, y, roomName } = sourceLink
                Logger.warning('buildNextLink:sourceLink', sourceLink)
                const pos = new RoomPosition(x, y, roomName)
                return makeConstructionSite(pos, STRUCTURE_LINK) === OK
            }
        }
        return false
    }

    private canBuildStorage = wrap(() => {
        const roomPlanner = new RoomPlanner(this.room)
        return (
            this.room.controller &&
            this.room.controller.level >= 4 &&
            roomPlanner.storage &&
            !hasStorage(this.room)
        )
    }, 'BuildManager:canBuildStorage')

    private buildNextStorage = wrap((): boolean => {
        let pos = this.snapshot.getStructurePos(STRUCTURE_STORAGE)
        if (pos !== null) {
            Logger.info('build-manager:buildNextStorage:cached', pos)
        } else {
            const roomPlanner = new RoomPlanner(this.room)
            const { x, y, roomName } = roomPlanner.storage!
            pos = new RoomPosition(x, y, roomName)
        }
        if (pos !== null) {
            return makeConstructionSite(pos, STRUCTURE_STORAGE) === OK
        }
        return false
    }, 'BuildManager:buildNextStorage')

    private hasNonWallSite() {
        return hasConstructionSite(this.room, {
            filter: (site) =>
                site.structureType !== STRUCTURE_WALL &&
                site.structureType !== STRUCTURE_RAMPART,
        })
    }

    private hasWallSite() {
        return hasConstructionSite(this.room, {
            filter: (site) =>
                site.structureType === STRUCTURE_WALL ||
                site.structureType === STRUCTURE_RAMPART,
        })
    }

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
            (pos) => iroom.get(pos.x, pos.y).terrain === TERRAIN_MASK_SWAMP,
        )

        if (cachedPos !== null) {
            Logger.info('build-manager:findSwampRoad:cached', cachedPos)
            return cachedPos
        }

        const pos = this.roads.find((value) => {
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
        const sources: RoomPosition[] = this.room.memory.sources.map(
            (source) => {
                const { x, y, roomName } = source.dropSpot.pos
                return new RoomPosition(x, y, roomName)
            },
        )
        const controller = this.room.controller.pos
        const spawns = this.room.find(FIND_MY_SPAWNS).map((spawn) => spawn.pos)
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
            const flatPos = iroom.nextExtensionPos()
            pos = new RoomPosition(flatPos.x, flatPos.y, this.room.name)
        }

        return makeConstructionSite(pos, STRUCTURE_EXTENSION) === OK
    }, 'BuildManager:buildNextExtension')

    private buildNextTower(): boolean {
        let pos = this.snapshot.getStructurePos(STRUCTURE_TOWER)

        if (pos !== null) {
            Logger.info('build-manager:buildNextTower:cached', pos)
        } else {
            const iroom = fromRoom(this.room)
            const flatPos = iroom.nextTowerPos()
            pos = new RoomPosition(flatPos.x, flatPos.y, this.room.name)
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
