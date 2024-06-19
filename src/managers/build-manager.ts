import includes from 'lodash/includes'
import {
    LINK_COUNTS,
    MIN_RAMPART_LEVEL,
    MIN_STORAGE_LEVEL,
    getConstructionSites,
    getContainers,
    getLinks,
    getRamparts,
    getRoads,
    hasBuildingAt,
    hasConstructionSite,
    hasNoSpawns,
    hasStorage,
    isAtExtensionCap,
    isAtTowerCap,
    makeConstructionSite,
    makeSpawnConstructionSite,
} from 'utils/room'
import * as Logger from 'utils/logger'
import { profile, wrap } from 'utils/profiling'
import { getConstructionFeatures } from 'surveyor'
import { Position } from 'types'
import pokemon from 'pokemon'

declare global {
    interface RoomMemory {
        construction: { paused: boolean }
    }
}

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

    removeEnemyConstructionSites() {
        const sites = this.room.find(FIND_HOSTILE_CONSTRUCTION_SITES)
        for (const site of sites) {
            site.remove()
        }
    }

    @profile
    ensureConstructionSites(): boolean {
        if (!this.room.controller || !this.room.controller.my) {
            return false
        }

        if (this.room.memory.construction.paused) {
            return false
        }

        if (hasNoSpawns(this.room)) {
            return this.ensureSpawnSite()
        }

        const nonWall = this.ensureNonWallSite()
        const wall = this.ensureWallSite()

        return nonWall || wall
    }

    private ensureSpawnSite(): boolean {
        const sites = getConstructionSites(this.room)
        if (sites.length > 0) {
            return false
        }
        return this.buildNextSpawn()
    }

    private ensureWallSite(): boolean {
        if (this.hasWallSite()) {
            return false
        }

        if (this.canBuildWall()) {
            return this.buildNextStructure(STRUCTURE_RAMPART)
        }

        return false
    }

    private ensureNonWallSite(): boolean {
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
            return terrain === TERRAIN_MASK_SWAMP || terrain === TERRAIN_MASK_WALL
        }
        return !includes([STRUCTURE_WALL, STRUCTURE_RAMPART], site.structureType)
    }, 'BuildManager:hasImportantConstructionSite')

    private canBuildContainer = wrap(() => {
        const containers = getContainers(this.room)
        const constructionFeatures = getConstructionFeatures(this.room)
        if (constructionFeatures[STRUCTURE_CONTAINER] === undefined) {
            return false
        }
        return containers.length < constructionFeatures[STRUCTURE_CONTAINER].length
    }, 'BuildManager:canBuildContainer')

    private nextBuildPosition(type: BuildableStructureConstant): RoomPosition | null {
        if (this.room.controller === undefined) {
            Logger.error('nextBuildPosition:controller:error:no-controller', this.room.name)
            return null
        }
        const constructionFeatures = getConstructionFeatures(this.room)
        let structures: Structure[] = []
        if (type === STRUCTURE_CONTAINER) {
            structures = getContainers(this.room)
        } else if (type === STRUCTURE_ROAD) {
            structures = getRoads(this.room)
        } else {
            structures = this.room.find(FIND_MY_STRUCTURES, {
                filter: { structureType: type },
            })
        }
        const toBuild = constructionFeatures[type]!.find(({ x, y }) => {
            return !structures.some((structure) => structure.pos.x === x && structure.pos.y === y)
        })
        if (toBuild === undefined) {
            Logger.error('nextBuildPosition:toBuild:error', type, this.room.name)
            return null
        }
        return new RoomPosition(toBuild.x, toBuild.y, this.room.name)
    }

    private buildNextStructure(type: BuildableStructureConstant): boolean {
        const toBuild = this.nextBuildPosition(type)
        if (toBuild === null) {
            return false
        }
        return (
            makeConstructionSite(new RoomPosition(toBuild.x, toBuild.y, this.room.name), type) ===
            OK
        )
    }

    private buildNextSpawn(): boolean {
        const toBuild = this.nextBuildPosition(STRUCTURE_SPAWN)
        if (toBuild === null) {
            return false
        }
        return makeSpawnConstructionSite(toBuild, pokemon()) === OK
    }

    private canBuildLinks = wrap(() => {
        const constructionFeatures = getConstructionFeatures(this.room)
        const links = getLinks(this.room)
        const possibleLinkCount = LINK_COUNTS[this.room.controller!.level]!
        return (
            links.length < Math.min(possibleLinkCount, constructionFeatures[STRUCTURE_LINK]!.length)
        )
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
                site.structureType !== STRUCTURE_WALL && site.structureType !== STRUCTURE_RAMPART,
        })
    }

    private hasWallSite() {
        return hasConstructionSite(this.room, {
            filter: (site) =>
                site.structureType === STRUCTURE_WALL || site.structureType === STRUCTURE_RAMPART,
        })
    }

    private canBuildTower = wrap((): boolean => {
        return !isAtTowerCap(this.room)
    }, 'BuildManager:canBuildTower')

    private canBuildSwampRoad = wrap((): boolean => {
        const pos = this.getNextRoad()
        if (pos === undefined) {
            return false
        }
        return this.room.getTerrain().get(pos.x, pos.y) === TERRAIN_MASK_SWAMP
    }, 'BuildManager:canBuildSwampRoad')

    private getNextRoad(): Position | undefined {
        const constructionFeatures = getConstructionFeatures(this.room)
        return constructionFeatures[STRUCTURE_ROAD]!.find((pos) => {
            return !hasBuildingAt(new RoomPosition(pos.x, pos.y, this.room.name), STRUCTURE_ROAD)
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
        const rampartPositions = constructionFeatures[STRUCTURE_RAMPART] || []
        const missingRamparts = rampartPositions.filter((pos) => {
            return !ramparts.some((rampart) => rampart.pos.x === pos.x && rampart.pos.y === pos.y)
        })
        return missingRamparts.length > 0
    }, 'BuildManager:canBuildWall')
}

export function getBuildManager(room: Room) {
    return BuildManager.get(room)
}
