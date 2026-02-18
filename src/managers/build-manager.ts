import includes from 'lodash/includes'
import pokemon from 'pokemon'

import * as Logger from 'utils/logger'
import * as TimeCache from 'utils/time-cache'
import {
    ConstructionFeatures,
    ConstructionFeaturesV3Base,
    ConstructionFeaturesV3Mine,
    getCalculatedLinks,
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

/** Maximum extensions to build early (enough for claiming) */
const IMPORTANT_EXTENSION_MAX = 7 // this should let us get a claim going

declare global {
    interface RoomMemory {
        /** Construction state tracking */
        construction: { paused: boolean }
    }
}

/**
 * Manages construction site creation and building priority.
 * Ensures structures are built in the correct order based on RCL.
 */
export default class BuildManager {
    /** Cache of build managers by room name */
    static cache = new Map<string, BuildManager>()
    /** The room being managed */
    private room: Room
    /** Construction features configuration */
    private constructionFeaturesV3: ConstructionFeaturesV3Base | ConstructionFeaturesV3Mine

    /**
     * Creates a new BuildManager.
     * @param room - The room to manage construction for
     * @param constructionFeaturesV3 - Construction features configuration
     */
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

    /** Gets the construction features (structure positions) */
    get constructionFeatures(): ConstructionFeatures {
        return this.constructionFeaturesV3.features as ConstructionFeatures
    }

    /** Gets the stationary points configuration */
    get points(): StationaryPoints {
        return this.constructionFeaturesV3.points as StationaryPoints
    }

    /** Gets the room's controller level */
    get controllerLevel(): number {
        return this.room.controller?.level ?? 0
    }

    /**
     * Factory method to get a BuildManager for a room.
     * @param room - The room to get manager for
     * @returns BuildManager or null if no features configured
     */
    static get(room: Room): BuildManager | null {
        const constructionFeatures = getConstructionFeaturesV3(room)
        if (!constructionFeatures || constructionFeatures.type === 'none') {
            return null
        }
        return new BuildManager(room, constructionFeatures)
    }

    /**
     * Checks if all planned roads are built.
     * @param room - The room to check
     */
    static allRoadsBuilt(room: Room): boolean {
        const buildManager = BuildManager.get(room)
        if (!buildManager) {
            return false
        }
        return buildManager.getNextRoad() === undefined
    }

    /** Removes enemy construction sites from the room */
    removeEnemyConstructionSites(): void {
        const sites = this.room.find(FIND_HOSTILE_CONSTRUCTION_SITES)
        for (const site of sites) {
            site.remove()
        }
    }

    /** Creates construction sites for needed structures (owned rooms) */
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

    /** Creates construction sites for mine rooms (containers and roads only) */
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

    /** Ensures a spawn construction site exists if needed */
    private ensureSpawnSite(): boolean {
        const sites = getConstructionSites(this.room)
        if (sites.length > 0 && sites.some((site) => site.structureType !== STRUCTURE_RAMPART)) {
            return false
        }
        return this.buildNextSpawn()
    }

    /** Ensures a wall/rampart construction site exists if needed */
    private ensureWallSite(): boolean {
        if (this.hasWallSite()) {
            return false
        }

        if (this.canBuildWall()) {
            return this.buildNextStructure(STRUCTURE_RAMPART)
        }

        return false
    }

    /** Ensures a non-wall construction site exists, respecting build priority */
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

        /**
        if (this.canBuildVirtualControllerLinkContainer()) {
            return this.buildVirtualControllerLinkContainer()
        }
        */

        if (this.canBuildImportantExtension()) {
            return this.buildNextStructure(STRUCTURE_EXTENSION)
        }

        if (this.canBuildTower()) {
            return this.buildNextStructure(STRUCTURE_TOWER)
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

        if (this.canBuildSwampRoad()) {
            return this.buildNextStructure(STRUCTURE_ROAD)
        }

        if (this.canBuildLinks()) {
            // Destroy any container at link positions before building
            const linkPositions = this.constructionFeatures[STRUCTURE_LINK]
            if (linkPositions) {
                for (const linkPos of linkPositions) {
                    const container = this.room
                        .lookForAt(LOOK_STRUCTURES, linkPos.x, linkPos.y)
                        .find((s) => s.structureType === STRUCTURE_CONTAINER)
                    if (container) {
                        Logger.warning('ensureNonWallSite:link:container-exists', this.room.name)
                        container.destroy()
                    }
                }
            }
            return this.buildNextStructure(STRUCTURE_LINK)
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

    /** Checks if the room has any construction sites */
    hasConstructionSites(): boolean {
        return getConstructionSites(this.room).length > 0
    }

    /** Checks if the room has non-wall construction sites */
    hasNonWallConstructionSites(): boolean {
        return getConstructionSites(this.room).some(
            (site) => site.structureType !== STRUCTURE_RAMPART,
        )
    }

    /** Checks if there are construction sites to build */
    canBuild(): boolean {
        return this.hasConstructionSites()
    }

    /** Checks if any important structure can be built or has a site */
    @profile
    canBuildImportant(): boolean {
        return (
            this.hasImportantConstructionSite() ||
            this.canBuildExtension() ||
            this.canBuildSwampRoad() ||
            this.canBuildTower() ||
            this.canBuildSourceContainer() ||
            this.canBuildVirtualStorageContainer() ||
            // this.canBuildVirtualControllerLinkContainer() ||
            this.canBuildStorage() ||
            this.canBuildLinks() ||
            this.canBuildRoad()
        )
    }

    /** Checks if an important (non-wall) construction site exists */
    private hasImportantConstructionSite = wrap((): boolean => {
        const sites = getConstructionSites(this.room)
        if (sites.length === 0) {
            return false
        }
        const site = sites[0]
        return !includes([STRUCTURE_WALL, STRUCTURE_RAMPART], site.structureType)
    }, 'BuildManager:hasImportantConstructionSite')

    /**
     * Gets the next position to build a structure type.
     * @param type - The structure type to build
     */
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

    /**
     * Creates a construction site for the next structure of a type.
     * @param type - The structure type to build
     */
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

    /** Creates a construction site for the next spawn */
    private buildNextSpawn(): boolean {
        const toBuild = this.nextBuildPosition(STRUCTURE_SPAWN)
        if (toBuild === null) {
            return false
        }
        return makeSpawnConstructionSite(toBuild, pokemon()) === OK
    }

    /** Checks if a source container needs to be built */
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

    /** Builds a container at the next source position needing one */
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

    /** Checks if a temporary storage container is needed (before RCL 4) */
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

    /** Builds a temporary container at the storage position */
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

    /** Checks if a temporary controller link container is needed (before RCL 5) */
    private canBuildVirtualControllerLinkContainer(): boolean {
        if ((this.room.controller?.level ?? 0) >= 5) {
            return false
        }
        const links = getCalculatedLinks(this.room)
        if (!links || !links.controller) {
            return false
        }
        const controllerLink = links.controller
        const existingContainers = getContainers(this.room)
        const existingLinks = getLinks(this.room)
        // Check if there's already a container or link at this position
        const hasStructureAtPosition =
            existingContainers.some(
                (container) =>
                    container.pos.x === controllerLink.x && container.pos.y === controllerLink.y,
            ) ||
            existingLinks.some(
                (link) => link.pos.x === controllerLink.x && link.pos.y === controllerLink.y,
            )
        return !hasStructureAtPosition
    }

    /** Builds a temporary container at the controller link position */
    private buildVirtualControllerLinkContainer(): boolean {
        const links = getCalculatedLinks(this.room)
        if (!links || !links.controller) {
            Logger.warning('buildVirtualControllerLinkContainer:no-links', this.room.name)
            return false
        }
        const controllerLink = links.controller
        return (
            makeConstructionSite(
                new RoomPosition(controllerLink.x, controllerLink.y, this.room.name),
                STRUCTURE_CONTAINER,
            ) === OK
        )
    }

    /** Checks if a mineral container needs to be built (disabled) */
    private canBuildMineralContainer(): boolean {
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
    }

    /** Builds a container at the mineral position */
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

    /** Checks if more links can be built at current RCL */
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

    /** Checks if storage can be built (RCL 4+, no existing storage) */
    private canBuildStorage = wrap((): boolean => {
        if (!this.room.controller || this.room.controller.level < MIN_STORAGE_LEVEL) {
            return false
        }
        return !hasStorage(this.room)
    }, 'BuildManager:canBuildStorage')

    /** Checks if a non-wall construction site exists */
    private hasNonWallSite() {
        return hasConstructionSite(this.room, {
            filter: (site) =>
                site.structureType !== STRUCTURE_WALL && site.structureType !== STRUCTURE_RAMPART,
        })
    }

    /** Checks if a wall/rampart construction site exists */
    private hasWallSite() {
        return hasConstructionSite(this.room, {
            filter: (site) =>
                site.structureType === STRUCTURE_WALL || site.structureType === STRUCTURE_RAMPART,
        })
    }

    /** Checks if more towers can be built at current RCL */
    private canBuildTower = wrap((): boolean => {
        return !isAtTowerCap(this.room)
    }, 'BuildManager:canBuildTower')

    /** Checks if a swamp road needs to be built (prioritized over plain roads) */
    private canBuildSwampRoad = wrap((): boolean => {
        const pos = this.getNextSwampRoad()
        if (pos === undefined) {
            return false
        }
        return this.room.getTerrain().get(pos.x, pos.y) === TERRAIN_MASK_SWAMP
    }, 'BuildManager:canBuildSwampRoad')

    /** Checks if any road needs to be built */
    private canBuildRoad = wrap((): boolean => {
        const pos = this.getNextRoad()
        return Boolean(pos)
    }, 'BuildManager:canBuildRoad')

    /** Gets the next swamp position needing a road */
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

    /** Gets the next position needing a road */
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

    /** Checks if early-game important extensions can be built */
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

    /** Checks if more extensions can be built at current RCL */
    private canBuildExtension = wrap(() => {
        if ((this.room.controller?.level ?? 0) < 2) {
            return false
        }
        return !isAtExtensionCap(this.room)
    }, 'BuildManager:canBuildExtension')

    /** Checks if more ramparts can be built at current RCL */
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

    /** Checks if terminal can be built (RCL 6+) */
    private canBuildTerminal = wrap((): boolean => {
        return Boolean((this.room.controller?.level ?? 0) >= 6 && !this.room.terminal)
    }, 'BuildManager:canBuildTerminal')

    /** Checks if more labs can be built at current RCL */
    private canBuildLab = wrap((): boolean => {
        const labs = getLabs(this.room)
        return (
            labs.length <
            (CONTROLLER_STRUCTURES[STRUCTURE_LAB][this.room.controller?.level ?? 0] ?? 0)
        )
    }, 'BuildManager:canBuildLab')

    /** Checks if extractor can be built (disabled) */
    private canBuildExtractor = wrap((): boolean => {
        const extractor = getExtractor(this.room)
        return Boolean(!extractor && this.controllerLevel >= 6)
    }, 'BuildManager:canBuildExtractor')

    /** Checks if factory can be built (RCL 7+) */
    private canBuildFactory = wrap((): boolean => {
        const factory = getFactory(this.room)
        return Boolean(factory && (this.room.controller?.level ?? 0) >= 7)
    }, 'BuildManager:canBuildFactory')
}

/**
 * Gets a BuildManager for a room.
 * @param room - The room to get manager for
 */
export function getBuildManager(room: Room): BuildManager | null {
    return BuildManager.get(room)
}
