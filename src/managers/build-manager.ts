import includes from 'lodash/includes'
import pokemon from 'pokemon'

import * as Logger from 'utils/logger'
import * as TimeCache from 'utils/time-cache'
import {
    ConstructionFeatures,
    getConstructionFeatures,
    getStationaryPointsBase,
} from 'construction-features'
import {
    LINK_COUNTS,
    MIN_RAMPART_LEVEL,
    MIN_STORAGE_LEVEL,
    getConstructionSites,
    getContainers,
    getExtensions,
    getExtractor,
    getFactory,
    getLabs,
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
import { profile, wrap } from 'utils/profiling'
import { Position } from 'types'

const IMPORTANT_EXTENSION_MAX = 7 // this should let us get a claim going

declare global {
    interface RoomMemory {
        construction: { paused: boolean }
    }
}

export default class BuildManager {
    static cache = new Map<string, BuildManager>()
    private room: Room
    private constructionFeatures: ConstructionFeatures

    constructor(room: Room, constructionFeatures: ConstructionFeatures) {
        this.room = room
        this.constructionFeatures = constructionFeatures

        if (!this.room.memory.construction) {
            this.room.memory.construction = { paused: false }
        }
    }

    static get(room: Room): BuildManager | null {
        const constructionFeatures = getConstructionFeatures(room)
        if (!constructionFeatures) {
            return null
        }
        return new BuildManager(room, constructionFeatures)
    }

    static allRoadsBuilt(room: Room): boolean {
        const buildManager = BuildManager.get(room)
        if (!buildManager) {
            return false
        }
        return buildManager.getNextRoad() === undefined
    }

    removeEnemyConstructionSites(): void {
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
        if (sites.length > 0 && sites.some((site) => site.structureType !== STRUCTURE_RAMPART)) {
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

        if (this.canBuildImportantContainer()) {
            return this.buildNextContainer()
        }

        if (this.canBuildImportantExtension()) {
            return this.buildNextStructure(STRUCTURE_EXTENSION)
        }

        if (this.canBuildTower()) {
            return this.buildNextStructure(STRUCTURE_TOWER)
        }

        if (this.canBuildSwampRoad()) {
            return this.buildNextStructure(STRUCTURE_ROAD)
        }

        if (this.canBuildStorage()) {
            const storage = (this.constructionFeatures[STRUCTURE_STORAGE] as Position[])[0]
            const container = this.room
                .lookForAt(LOOK_STRUCTURES, storage.x, storage.y)
                .find((s) => s.structureType === STRUCTURE_CONTAINER)
            if (container) {
                Logger.warning('ensureNonWallSite:storage:container-exists', this.room.name)
                container.destroy()
            }
            return this.buildNextStructure(STRUCTURE_STORAGE)
        }

        if (this.canBuildLinks()) {
            return this.buildNextStructure(STRUCTURE_LINK)
        }

        if (this.canBuildRoad()) {
            return this.buildNextStructure(STRUCTURE_ROAD)
        }

        if (this.canBuildTerminal()) {
            return this.buildNextStructure(STRUCTURE_TERMINAL)
        }

        if (this.canBuildExtension()) {
            return this.buildNextStructure(STRUCTURE_EXTENSION)
        }

        if (this.canBuildLab()) {
            return this.buildNextStructure(STRUCTURE_LAB)
        }

        if (this.canBuildContainer()) {
            return this.buildNextContainer()
        }

        if (this.canBuildExtractor()) {
            return this.buildNextStructure(STRUCTURE_EXTRACTOR)
        }

        if (this.canBuildFactory()) {
            return this.buildNextStructure(STRUCTURE_FACTORY)
        }

        return false
    }

    @profile
    canBuildImportant(): boolean {
        return (
            this.hasImportantConstructionSite() ||
            this.canBuildExtension() ||
            this.canBuildSwampRoad() ||
            this.canBuildTower() ||
            this.canBuildContainer() ||
            this.canBuildStorage() ||
            this.canBuildLinks() ||
            this.canBuildRoad()
        )
    }

    private hasImportantConstructionSite = wrap((): boolean => {
        const sites = getConstructionSites(this.room)
        if (sites.length === 0) {
            return false
        }
        const site = sites[0]
        return !includes([STRUCTURE_WALL, STRUCTURE_RAMPART], site.structureType)
    }, 'BuildManager:hasImportantConstructionSite')

    private canBuildImportantContainer = wrap((): boolean => {
        const containers = getContainers(this.room)
        if (this.constructionFeatures[STRUCTURE_CONTAINER] === undefined) {
            return false
        }
        let possibleContainers = this.constructionFeatures[STRUCTURE_CONTAINER].length
        if ((this.room.controller?.level ?? 0) < 4) {
            possibleContainers += 1
        }
        const stationaryPointsBase = getStationaryPointsBase(this.room)
        if (stationaryPointsBase && stationaryPointsBase.mineral) {
            possibleContainers -= 1
        }
        return containers.length < possibleContainers
    }, 'BuildManager:canBuildImportantContainer')

    private canBuildContainer = wrap(() => {
        const containers = getContainers(this.room)
        if (this.constructionFeatures[STRUCTURE_CONTAINER] === undefined) {
            return false
        }
        const extraContainers = (this.room.controller?.level ?? 0) < 4 ? 1 : 0
        return (
            containers.length <
            this.constructionFeatures[STRUCTURE_CONTAINER].length + extraContainers - 1
        )
    }, 'BuildManager:canBuildContainer')

    private nextBuildPosition(type: BuildableStructureConstant): RoomPosition | null {
        if (this.room.controller === undefined) {
            Logger.error('nextBuildPosition:controller:error:no-controller', this.room.name)
            return null
        }
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
        const constructionPosition = this.constructionFeatures[type]
        if (constructionPosition === undefined) {
            Logger.warning('nextBuildPosition:no-construction-features', type, this.room.name)
            return null
        }

        const toBuild = constructionPosition.find(({ x, y }) => {
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

    private buildNextContainer(): boolean {
        let containers = getContainers(this.room)
        const points = getStationaryPointsBase(this.room)
        if (points && points.mineral) {
            containers = containers.filter(
                (c) => c.pos.x !== points.mineral.x || c.pos.y !== points.mineral.y,
            )
        }
        const containerPositions = (
            this.constructionFeatures[STRUCTURE_CONTAINER] as Position[]
        ).slice(0, -1)
        if (containerPositions.length > containers.length) {
            return this.buildNextStructure(STRUCTURE_CONTAINER)
        }
        // here we build a temporary container where storage is supposed to be
        const storage = (this.constructionFeatures[STRUCTURE_STORAGE] as Position[])[0]
        return (
            makeConstructionSite(
                new RoomPosition(storage.x, storage.y, this.room.name),
                STRUCTURE_CONTAINER,
            ) === OK
        )
    }

    private canBuildLinks = wrap(() => {
        const links = getLinks(this.room)
        if (this.room.controller === undefined) {
            Logger.error('canBuildLinks:controller:error:no-controller', this.room.name)
            return false
        }
        const linkPositions = this.constructionFeatures[STRUCTURE_LINK]
        if (linkPositions === undefined) {
            Logger.warning('canBuildLinks:no-link-positions', this.room.name)
            return false
        }
        const possibleLinkCount = LINK_COUNTS[this.room.controller.level] || 0
        return links.length < Math.min(possibleLinkCount, linkPositions.length)
    }, 'BuildManager:canBuildLinks')

    private canBuildStorage = wrap((): boolean => {
        if (!this.room.controller || this.room.controller.level < MIN_STORAGE_LEVEL) {
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
        const pos = this.getNextSwampRoad()
        if (pos === undefined) {
            return false
        }
        return this.room.getTerrain().get(pos.x, pos.y) === TERRAIN_MASK_SWAMP
    }, 'BuildManager:canBuildSwampRoad')

    private canBuildRoad = wrap((): boolean => {
        const pos = this.getNextRoad()
        return Boolean(pos)
    }, 'BuildManager:canBuildRoad')

    private getNextSwampRoad(): Position | undefined {
        return TimeCache.get(`build-manager:getNextSwampRoad:${this.room.name}`, () => {
            if (this.constructionFeatures[STRUCTURE_ROAD] === undefined) {
                Logger.warning('getNextRoad:no-road-features', this.room.name)
                return undefined
            }
            return this.constructionFeatures[STRUCTURE_ROAD]?.find((pos) => {
                const hasBuilding = hasBuildingAt(
                    new RoomPosition(pos.x, pos.y, this.room.name),
                    STRUCTURE_ROAD,
                )
                const hasSwamp = this.room.getTerrain().get(pos.x, pos.y) === TERRAIN_MASK_SWAMP
                return !hasBuilding && hasSwamp
            })
        })
    }

    private getNextRoad(): Position | undefined {
        return TimeCache.get(`build-manager:getNextRoad:${this.room.name}`, () => {
            if (this.constructionFeatures[STRUCTURE_ROAD] === undefined) {
                Logger.warning('getNextRoad:no-road-features', this.room.name)
                return undefined
            }
            return this.constructionFeatures[STRUCTURE_ROAD].find((pos) => {
                return !hasBuildingAt(
                    new RoomPosition(pos.x, pos.y, this.room.name),
                    STRUCTURE_ROAD,
                )
            })
        })
    }

    private canBuildImportantExtension = (): boolean => {
        if ((this.room.controller?.level ?? 0) < 2) {
            return false
        }
        if (isAtExtensionCap(this.room)) {
            return false
        }
        const extensions = getExtensions(this.room)
        return extensions.length < IMPORTANT_EXTENSION_MAX
    }

    private canBuildExtension = wrap(() => {
        if ((this.room.controller?.level ?? 0) < 2) {
            return false
        }
        return !isAtExtensionCap(this.room)
    }, 'BuildManager:canBuildExtension')

    private canBuildWall = wrap((): boolean => {
        if (!this.room.controller || this.room.controller.level < MIN_RAMPART_LEVEL) {
            return false
        }
        const ramparts = getRamparts(this.room)
        const rampartPositions = this.constructionFeatures[STRUCTURE_RAMPART] || []
        const missingRamparts = rampartPositions.filter((pos) => {
            return !ramparts.some((rampart) => rampart.pos.x === pos.x && rampart.pos.y === pos.y)
        })
        return missingRamparts.length > 0
    }, 'BuildManager:canBuildWall')

    private canBuildTerminal = wrap((): boolean => {
        return Boolean((this.room.controller?.level ?? 0) >= 6 && !this.room.terminal)
    }, 'BuildManager:canBuildTerminal')

    private canBuildLab = wrap((): boolean => {
        const labs = getLabs(this.room)
        return (
            labs.length <
            (CONTROLLER_STRUCTURES[STRUCTURE_LAB][this.room.controller?.level ?? 0] ?? 0)
        )
    }, 'BuildManager:canBuildLab')

    private canBuildExtractor = wrap((): boolean => {
        const extractor = getExtractor(this.room)
        return Boolean(extractor && (this.room.controller?.level ?? 0) >= 6)
    }, 'BuildManager:canBuildExtractor')

    private canBuildFactory = wrap((): boolean => {
        const factory = getFactory(this.room)
        return Boolean(factory && (this.room.controller?.level ?? 0) >= 7)
    }, 'BuildManager:canBuildFactory')
}

export function getBuildManager(room: Room): BuildManager | null {
    return BuildManager.get(room)
}
