import includes from 'lodash/includes'
import pokemon from 'pokemon'

import * as Logger from 'utils/logger'
import * as TimeCache from 'utils/time-cache'
import {
    ConstructionFeatures,
    ConstructionFeaturesV3Base,
    ConstructionFeaturesV3Mine,
    getConstructionFeaturesV3,
    getStationaryPoints,
    StationaryPoints,
} from 'construction-features'
import {
    LINK_COUNTS,
    MIN_RAMPART_LEVEL,
    MIN_STORAGE_LEVEL,
    getConstructionSites,
    getContainers,
    getExtensions,
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
    private constructionFeaturesV3: ConstructionFeaturesV3Base | ConstructionFeaturesV3Mine

    constructor(
        room: Room,
        constructionFeaturesV3: ConstructionFeaturesV3Base | ConstructionFeaturesV3Mine,
    ) {
        this.room = room
        this.constructionFeaturesV3 = constructionFeaturesV3

        if (!this.room.memory.construction) {
            this.room.memory.construction = { paused: false }
        }
    }

    get constructionFeatures(): ConstructionFeatures {
        return this.constructionFeaturesV3.features as ConstructionFeatures
    }

    get points(): StationaryPoints {
        return this.constructionFeaturesV3.points as StationaryPoints
    }

    get controllerLevel(): number {
        return this.room.controller?.level ?? 0
    }

    static get(room: Room): BuildManager | null {
        const constructionFeatures = getConstructionFeaturesV3(room)
        if (!constructionFeatures || constructionFeatures.type === 'none') {
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

    @profile
    ensureMineConstructionSites(): boolean {
        if (this.room.memory.construction.paused || this.canBuild()) {
            return false
        }

        if (
            !this.room.controller ||
            this.room.controller.owner ||
            (this.room.controller.reservation &&
                this.room.controller.reservation.username !== global.USERNAME)
        ) {
            return false
        }

        if (this.canBuildSourceContainer()) {
            return this.buildNextSourceContainer()
        }

        if (this.canBuildRoad()) {
            return this.buildNextStructure(STRUCTURE_ROAD)
        }
        return false
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

        if (this.canBuildSourceContainer()) {
            return this.buildNextSourceContainer()
        }

        if (this.canBuildVirtualStorageContainer()) {
            return this.buildVirtualStorageContainer()
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

        if (this.canBuildExtractor()) {
            return this.buildNextStructure(STRUCTURE_EXTRACTOR)
        }

        if (this.canBuildMineralContainer()) {
            return this.buildMineralContainer()
        }

        if (this.canBuildFactory()) {
            return this.buildNextStructure(STRUCTURE_FACTORY)
        }

        return false
    }

    hasConstructionSites(): boolean {
        return getConstructionSites(this.room).length > 0
    }

    hasNonWallConstructionSites(): boolean {
        return getConstructionSites(this.room).some(
            (site) => site.structureType !== STRUCTURE_RAMPART,
        )
    }

    canBuild(): boolean {
        return this.hasConstructionSites()
    }

    @profile
    canBuildImportant(): boolean {
        return (
            this.hasImportantConstructionSite() ||
            this.canBuildExtension() ||
            this.canBuildSwampRoad() ||
            this.canBuildTower() ||
            this.canBuildSourceContainer() ||
            this.canBuildVirtualStorageContainer() ||
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

    private canBuildSourceContainer(): boolean {
        const points = getStationaryPoints(this.room)
        if (!points) {
            Logger.warning('canBuildSpawnContainer:no-stationary-points', this.room.name)
            return false
        }
        const sourcePositions = Object.values(points.sources)
        const existingContainers = getContainers(this.room)
        const toBuild = sourcePositions.find((pos) => {
            return !existingContainers.some(
                (container) => container.pos.x === pos.x && container.pos.y === pos.y,
            )
        })
        return Boolean(toBuild)
    }

    private buildNextSourceContainer(): boolean {
        const sourcePositions = Object.values(this.points.sources)
        const existingContainers = getContainers(this.room)
        const toBuild = sourcePositions.find((pos) => {
            return !existingContainers.some(
                (container) => container.pos.x === pos.x && container.pos.y === pos.y,
            )
        })
        if (toBuild === undefined) {
            Logger.warning('buildNextSpawnContainer:no-container-positions', this.room.name)
            return false
        }
        const err = makeConstructionSite(
            new RoomPosition(toBuild.x, toBuild.y, this.room.name),
            STRUCTURE_CONTAINER,
        )
        return err === OK
    }

    private canBuildVirtualStorageContainer(): boolean {
        if ((this.room.controller?.level ?? 0) >= 4) {
            return false
        }
        const existingContainers = getContainers(this.room)
        if (!this.constructionFeatures[STRUCTURE_STORAGE]) {
            return false
        }
        const storage = this.constructionFeatures[STRUCTURE_STORAGE][0]
        return !existingContainers.some(
            (container) => container.pos.x === storage.x && container.pos.y === storage.y,
        )
    }

    private buildVirtualStorageContainer(): boolean {
        if (!this.constructionFeatures[STRUCTURE_STORAGE]) {
            Logger.warning('buildVirtualStorageContainer:no-storage-features', this.room.name)
            return false
        }
        const storage = this.constructionFeatures[STRUCTURE_STORAGE][0]
        return (
            makeConstructionSite(
                new RoomPosition(storage.x, storage.y, this.room.name),
                STRUCTURE_CONTAINER,
            ) === OK
        )
    }

    private canBuildMineralContainer(): boolean {
        return false
        /**
        if (this.controllerLevel < 6) {
            return false
        }
        if (this.points.type === 'mine') {
            return false
        }
        const mineral = this.points.mineral
        const existingContainers = getContainers(this.room)
        return !existingContainers.some(
            (container) => container.pos.x === mineral.x && container.pos.y === mineral.y,
        )
        */
    }

    private buildMineralContainer(): boolean {
        if (this.points.type === 'mine') {
            Logger.warning('buildMineralContainer:mine', this.room.name)
            return false
        }
        const mineral = this.points.mineral
        return (
            makeConstructionSite(
                new RoomPosition(mineral.x, mineral.y, this.room.name),
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
        return false
        /**
        const extractor = getExtractor(this.room)
        return Boolean(!extractor && this.controllerLevel >= 6)
        */
    }, 'BuildManager:canBuildExtractor')

    private canBuildFactory = wrap((): boolean => {
        const factory = getFactory(this.room)
        return Boolean(factory && (this.room.controller?.level ?? 0) >= 7)
    }, 'BuildManager:canBuildFactory')
}

export function getBuildManager(room: Room): BuildManager | null {
    return BuildManager.get(room)
}
