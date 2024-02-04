import includes from 'lodash/includes'
import { Record as IRecord, OrderedSet } from 'immutable'
import {
    LINK_COUNTS,
    MIN_RAMPART_LEVEL,
    MIN_STORAGE_LEVEL,
    getConstructionSites,
    getContainers,
    getLinks,
    getRamparts,
    hasConstructionSite,
    hasStorage,
    isAtExtensionCap,
    isAtTowerCap,
    makeConstructionSite,
} from 'utils/room'
import * as Logger from 'utils/logger'
import { profile, wrap } from 'utils/profiling'
import { getConstructionFeatures } from 'surveyor'
import { fromRoom } from 'utils/immutable-room'
import { Position } from 'types'

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
    public room: Room

    constructor(room: Room) {
        this.room = room

        if (!this.room.memory.construction) {
            this.room.memory.construction = { paused: false }
        }
    }

    static get(room: Room): BuildManager {
        return new BuildManager(room)
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
            return this.buildNextStructure(STRUCTURE_RAMPART)
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

        if (this.canBuildExtension()) {
            return this.buildNextStructure(STRUCTURE_EXTENSION)
        }

        if (this.canBuildTower()) {
            return this.buildNextStructure(STRUCTURE_TOWER)
        }

        if (this.canBuildSwampRoad()) {
            return this.buildNextStructure(STRUCTURE_ROAD)
        }

        if (this.canBuildContainer()) {
            return this.buildNextStructure(STRUCTURE_CONTAINER)
        }

        if (this.canBuildStorage()) {
            return this.buildNextStructure(STRUCTURE_STORAGE)
        }

        if (this.canBuildLinks()) {
            return this.buildNextStructure(STRUCTURE_LINK)
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
        const containers = getContainers(this.room);
        const constructionFeatures = getConstructionFeatures(this.room)
        if (constructionFeatures[STRUCTURE_CONTAINER] === undefined) {
            return false
        }
        return containers.length < constructionFeatures[STRUCTURE_CONTAINER].length
    }, 'BuildManager:canBuildContainer')

    private buildNextStructure(type: BuildableStructureConstant): boolean {
        if (this.room.controller === undefined) {
            Logger.error('buildNextBuilding:controller:error:no-controller', this.room.name)
            return false
        }
        const constructionFeatures = getConstructionFeatures(this.room)
        let structures: Structure[] = []
        if (type === STRUCTURE_CONTAINER) {
            structures = getContainers(this.room)
        } else {
            structures = this.room.find(FIND_MY_STRUCTURES, {
                filter: { structureType: type },
            })
        }
        const toBuild = constructionFeatures[type]!.find(({ x, y }) => {
            return !structures.some((structure) => structure.pos.x === x && structure.pos.y === y)
        })
        if (toBuild === undefined) {
            Logger.error('buildNextBuilding:toBuild:error', type, this.room.name)
            return false
        }
        return makeConstructionSite(new RoomPosition(toBuild.x, toBuild.y, this.room.name), type) === OK
    }

    private canBuildLinks = wrap(() => {
        const constructionFeatures = getConstructionFeatures(this.room)
        const links = getLinks(this.room)
        const possibleLinkCount = LINK_COUNTS[this.room.controller!.level]!
        return links.length < Math.min(possibleLinkCount, constructionFeatures[STRUCTURE_LINK]!.length)
    }, 'BuildManager:canBuildLinks')

    private canBuildStorage = wrap((): boolean => {
        if (this.room.controller!.level < MIN_STORAGE_LEVEL) {
            return false
        }
        return !hasStorage(this.room)
    }, 'BuildManager:canBuildStorage')

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

    private canBuildTower = wrap((): boolean => {
        return !isAtTowerCap(this.room)
    }, 'BuildManager:canBuildTower')

    private canBuildSwampRoad = wrap((): boolean => {
        const iroom = fromRoom(this.room)
        const pos = this.getNextRoad()
        if (pos === undefined) {
            return false
        }
        return iroom.get(pos!.x, pos!.y).terrain === TERRAIN_MASK_SWAMP
    }, 'BuildManager:canBuildSwampRoad')

    private getNextRoad(): Position | undefined {
        const constructionFeatures = getConstructionFeatures(this.room)
        const iroom = fromRoom(this.room)
        return constructionFeatures[STRUCTURE_ROAD]!.find((pos) => {
            return !iroom.get(pos.x, pos.y).nonObstacles.road
        })
    }

    private canBuildExtension = wrap(() => {
        return !isAtExtensionCap(this.room)
    }, 'BuildManager:canBuildExtension')

    private canBuildWall = wrap((): boolean => {
        if (this.room.controller!.level < MIN_RAMPART_LEVEL) {
            return false
        }
        const constructionFeatures = getConstructionFeatures(this.room)
        const ramparts = getRamparts(this.room)
        return ramparts.length < constructionFeatures[STRUCTURE_RAMPART]!.length
    }, 'BuildManager:canBuildWall')
}

export function getBuildManager(room: Room) {
    return BuildManager.get(room)
}
