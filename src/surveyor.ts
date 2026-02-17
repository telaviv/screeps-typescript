import { each } from 'lodash'
import semverGte from 'semver/functions/gte'

import * as Logger from 'utils/logger'
import * as Profiling from 'utils/profiling'
import {
    CONSTRUCTION_FEATURES_V3_VERSION,
    CONSTRUCTION_FEATURES_VERSION,
    STATIONARY_POINTS_VERSION,
    ConstructionFeatures,
    ConstructionFeaturesV3,
    ConstructionMovement,
    Links,
    StationaryPointsBase,
    getCalculatedLinks,
    getConstructionFeatures,
    getConstructionFeaturesV3,
    getStationaryPoints,
    constructionFeaturesV3NeedsUpdate,
    MinerInformation,
} from 'construction-features'
import {
    findSpawnlessRooms,
    findSpawnRooms,
    getBuildableStructures,
    getConstructionSites,
    getRoomType,
    RoomType,
} from 'utils/room'
import { isObstacle, Position } from 'types'
import BUNKER from 'stamps/bunker'
import { Mine } from 'managers/mine-manager'
import { SubscriptionEvent } from 'pub-sub/constants'
import { destroyMovementStructures } from 'construction-movement'
import { publish } from 'pub-sub/pub-sub'

import { PREFERENCE_WORKER } from 'roles/logistics-constants'
import { getLogisticsCreeps } from 'utils/creep'

// New stamp-based system imports
import { placeBunker, BunkerPlacementResult } from 'stamps/placement'
import { calculateStationaryPoints, StationaryPointsResult } from 'stamps/stationary-points'
import { calculateLinks as calculateLinksNew, LinksResult } from 'stamps/links'
import { calculateRamparts } from 'stamps/ramparts'
import { calculateBunkerRoads } from 'stamps/roads'
import { calculateMineRoads } from 'stamps/mine-roads'
import { calculateMineInternal } from 'stamps/mine-internal'

/** Minimum CPU bucket required before running survey calculations */
const MIN_SURVEY_CPU = 1500

declare global {
    interface RoomMemory {
        /**
         * @deprecated
         */
        calculateConstructionFeaturesV3?: void
        constructionFeaturesV3?: ConstructionFeaturesV3
        /**
         * @deprecated All code now uses the new stamp-based bunker system
         */
        useNewBunkerSystem?: boolean
    }

    namespace NodeJS {
        interface Global {
            setConstructionFeaturesV3(roomName: string): void
            clearConstructionFeatures(roomName: string): void
            clearAllConstructionFeatures(): void
        }
    }
}

global.setConstructionFeaturesV3 = setConstructionFeaturesV3
global.clearConstructionFeatures = clearConstructionFeatures
global.clearAllConstructionFeatures = clearAllConstructionFeatures

/**
 * Checks if all construction features have been calculated for a room.
 * @param room - The room to check
 * @returns True if features, links, and stationary points are all set
 */
export const isSurveyComplete = Profiling.wrap((room: Room): boolean => {
    return Boolean(
        getConstructionFeatures(room) && getCalculatedLinks(room) && getStationaryPoints(room),
    )
}, 'isSurveyComplete')

/**
 * Clears cached construction features for a room.
 * @param roomName - Name of the room
 */
function clearConstructionFeatures(roomName: string) {
    Memory.rooms[roomName].constructionFeaturesV3 = undefined
}

/**
 * Publishes an event when construction features change for a room.
 * @param roomName - Name of the room
 */
function publishConstructionFeatureChange(roomName: string) {
    publish(SubscriptionEvent.CONSTRUCTION_FEATURES_UPDATES, roomName)
}

/** Clears construction features for all visible rooms. */
function clearAllConstructionFeatures() {
    each(Game.rooms, (room: Room) => {
        clearConstructionFeatures(room.name)
    })
}

/**
 * Calculates and stores construction features v3 for a room.
 * @param roomName - Name of the room to calculate features for
 */
export function setConstructionFeaturesV3(roomName: string): void {
    // we need to have already scouted the room so that we don't waste time
    // on rooms with no controller or 1 source etc ....
    const roomMemory = Memory.rooms[roomName]
    Logger.warning('setConstructionFeaturesV3:setting', roomName)
    roomMemory.constructionFeaturesV3 = calculateConstructionFeaturesV3(roomName)
    publishConstructionFeatureChange(roomName)
}

/**
 * Checks if room construction features match the current version.
 * @param room - The room to check
 */
export function isConstructionFeaturesUpToDate(room: Room): boolean {
    return Boolean(
        room.memory.constructionFeaturesV3 &&
            room.memory.constructionFeaturesV3.version === CONSTRUCTION_FEATURES_VERSION,
    )
}

/**
 * Calculates complete construction features for a room using new stamp-based system.
 * @param roomName - Name of the room
 * @returns Construction features v3 data structure
 */
function calculateConstructionFeaturesV3New(roomName: string): ConstructionFeaturesV3 {
    if (getRoomType(roomName) !== RoomType.ROOM) {
        return { version: CONSTRUCTION_FEATURES_V3_VERSION, type: 'none' }
    }

    // Get scout data
    const roomMemory = Memory.rooms[roomName]
    const scout = roomMemory.scout
    if (
        !scout ||
        !scout.sourcePositions ||
        !scout.controllerPosition ||
        !scout.mineralPosition ||
        Object.keys(scout.sourcePositions).length !== 2
    ) {
        Logger.warning(
            'calculateConstructionFeaturesV3New:no-scout-data',
            roomName,
            'Needs scouting with 2 sources',
        )
        return { version: CONSTRUCTION_FEATURES_V3_VERSION, type: 'mine' }
    }

    const sourcePositions = scout.sourcePositions
    const controllerPosition = scout.controllerPosition
    const mineralPosition = scout.mineralPosition

    // Convert source positions to array format
    const sourcesArray = Object.entries(sourcePositions).map(([id, pos]) => ({
        id,
        x: pos.x,
        y: pos.y,
    }))

    // Get terrain
    const terrain = new Room.Terrain(roomName)

    // Place bunker
    const placementResult: BunkerPlacementResult = placeBunker({
        terrain,
        roomName,
        sources: sourcesArray,
        controller: controllerPosition,
        stamp: BUNKER,
    })

    if (!placementResult.success) {
        Logger.warning('calculateConstructionFeaturesV3New:placement-failed', roomName)
        return { version: CONSTRUCTION_FEATURES_V3_VERSION, type: 'mine' }
    }

    // Calculate stationary points
    const stationaryPoints: StationaryPointsResult = calculateStationaryPoints(
        terrain,
        placementResult.buildings,
        sourcesArray,
        controllerPosition,
        mineralPosition,
    )

    // Calculate links
    const linksResult: LinksResult = calculateLinksNew(
        terrain,
        placementResult.buildings,
        stationaryPoints,
        sourcesArray,
        controllerPosition,
    )

    // Calculate ramparts
    const rampartPositions = calculateRamparts(
        terrain,
        placementResult.buildings,
        stationaryPoints,
        sourcesArray.map((s) => ({ x: s.x, y: s.y })),
        controllerPosition,
        mineralPosition,
    )

    // Get static roads from bunker stamp
    const stampRoads = placementResult.buildings.get('road') || []

    // Calculate additional roads from bunker to external features (controller, sources, mineral)
    // Uses storage link stationary point as the start position (where the hauler stands)
    const additionalRoads = calculateBunkerRoads(
        terrain,
        placementResult.buildings,
        stationaryPoints.storageLink,
        sourcesArray.map((s) => ({ x: s.x, y: s.y })),
        controllerPosition,
        mineralPosition,
    )

    // Combine stamp roads with additional calculated roads
    const bunkerRoads = stampRoads.concat(additionalRoads)

    // Update buildings map with all roads (for mine road pathfinding)
    placementResult.buildings.set('road', bunkerRoads)

    // Calculate mine roads (from base to remote mines)
    const mines: Mine[] = roomMemory.mines ?? []

    // Use storage link stationary point - it's always accessible and walkable
    const startPos = stationaryPoints.storageLink

    const mineRoadResults = calculateMineRoads(roomName, startPos, mines, placementResult.buildings)

    // Combine all roads
    const mineRoadsInBase: Position[] = []
    for (const result of mineRoadResults) {
        mineRoadsInBase.push(...result.minerRoads)
    }
    const allRoads = bunkerRoads.concat(mineRoadsInBase)

    // Build features map
    const features: ConstructionFeatures = {
        [STRUCTURE_EXTENSION]: placementResult.buildings.get('extension') || [],
        [STRUCTURE_TOWER]: placementResult.buildings.get('tower') || [],
        [STRUCTURE_STORAGE]: placementResult.buildings.get('storage') || [],
        [STRUCTURE_TERMINAL]: placementResult.buildings.get('terminal') || [],
        [STRUCTURE_NUKER]: placementResult.buildings.get('nuker') || [],
        [STRUCTURE_LAB]: placementResult.buildings.get('lab') || [],
        [STRUCTURE_OBSERVER]: placementResult.buildings.get('observer') || [],
        [STRUCTURE_FACTORY]: placementResult.buildings.get('factory') || [],
        [STRUCTURE_LINK]: placementResult.buildings.get('link') || [],
        [STRUCTURE_CONTAINER]: sourcesArray
            .map((s) => stationaryPoints.sources[s.id])
            .concat([stationaryPoints.mineral]),
        [STRUCTURE_SPAWN]: placementResult.buildings.get('spawn') || [],
        [STRUCTURE_RAMPART]: rampartPositions,
        [STRUCTURE_ROAD]: allRoads,
    }

    // Build stationary points in expected format
    const stationaryPointsBase: StationaryPointsBase = {
        type: 'base',
        version: STATIONARY_POINTS_VERSION,
        sources: stationaryPoints.sources,
        mineral: stationaryPoints.mineral,
        controllerLink: stationaryPoints.controllerLink,
        storageLink: stationaryPoints.storageLink,
    }

    // Build links in expected format
    const links: Links = {
        version: linksResult.version,
        controller: linksResult.controller,
        storage: linksResult.storage,
        sourceContainers: linksResult.sourceContainers.map((sc) => ({
            source: sc.source as Id<Source>,
            container: sc.container,
            link: sc.link,
        })),
    }

    // Build miner information from mine road results
    const miner: MinerInformation = {}
    for (const result of mineRoadResults) {
        // Store exit position for this mine
        miner[result.name] = { exitPosition: result.exitPosition }

        // Calculate mine's internal features using the entrance position
        setMineConstructionFeaturesV3(result.name, roomName, result.entrancePosition)
    }

    return {
        version: CONSTRUCTION_FEATURES_V3_VERSION,
        type: 'base',
        features,
        points: stationaryPointsBase,
        links,
        miner,
        movement: null,
    }
}

/**
 * Calculates complete construction features for a room including bunker layout and roads.
 * Uses the new stamp-based bunker system.
 *
 * @param roomName - Name of the room
 * @returns Construction features v3 data structure
 */
function calculateConstructionFeaturesV3(roomName: string): ConstructionFeaturesV3 {
    return calculateConstructionFeaturesV3New(roomName)
}

/**
 * Calculates and stores construction features for a remote mining room.
 * Uses the new stamp-based system for mine calculations.
 * @param mineName - Name of the mining room
 * @param miner - Name of the home room that will mine this
 * @param entrancePosition - Position where the road enters the mining room
 */
function setMineConstructionFeaturesV3(
    mineName: string,
    miner: string,
    entrancePosition: Position,
): void {
    const flatPos = { x: entrancePosition.x, y: entrancePosition.y, roomName: mineName }

    // Use new stamp-based mine calculation
    const ret = calculateMineInternal(mineName, flatPos)

    if (!ret) {
        Logger.error('setMineConstructionFeaturesV3:failed', mineName)
        return
    }

    const { features, points } = ret
    const constructionFeaturesV3: ConstructionFeaturesV3 = {
        version: CONSTRUCTION_FEATURES_V3_VERSION,
        type: 'mine',
        features,
        points: { version: STATIONARY_POINTS_VERSION, type: 'mine', sources: points },
        minee: {
            miner,
            entrancePosition: flatPos,
        },
        movement: null,
    }
    Memory.rooms[mineName].constructionFeaturesV3 = constructionFeaturesV3
}

/**
 * Calculates differences between built structures and planned features.
 * Used to identify structures that need to be moved or removed.
 * @param room - The room to analyze
 * @param features - The planned construction features
 * @param existingMovement - Optional existing movement to check against (to avoid duplicate warnings)
 * @returns Movement instructions for misplaced structures
 */
export function calculateBuildingDiff(
    room: Room,
    features: ConstructionFeatures,
    existingMovement?: ConstructionMovement,
): ConstructionMovement {
    const diff = {} as ConstructionMovement
    const builtStructures = getBuildableStructures(room)
    for (const builtStructure of builtStructures) {
        // Skip structures on map edges - they cannot be destroyed
        if (
            builtStructure.pos.x === 0 ||
            builtStructure.pos.x === 49 ||
            builtStructure.pos.y === 0 ||
            builtStructure.pos.y === 49
        ) {
            continue
        }

        const match = features[builtStructure.structureType]?.find(
            ({ x, y }) => x === builtStructure.pos.x && y === builtStructure.pos.y,
        )
        if (match) {
            continue
        }
        // if there's a container temporarily replacing a storage, don't worry about it
        if (builtStructure.structureType === STRUCTURE_CONTAINER) {
            const storage = features[STRUCTURE_STORAGE]?.find(
                ({ x, y }) => x === builtStructure.pos.x && y === builtStructure.pos.y,
            )
            if (storage && (room.controller?.level ?? 0) < 4) {
                continue
            }
            // if there's a container temporarily replacing a link, don't worry about it
            const links = getCalculatedLinks(room)
            if (links && (room.controller?.level ?? 0) < 5) {
                const controllerLink = links.controller
                if (
                    controllerLink.x === builtStructure.pos.x &&
                    controllerLink.y === builtStructure.pos.y
                ) {
                    continue
                }
            }
        }

        // Only warn if this is a NEW addition (not already in existing movement)
        const isNewAddition =
            !existingMovement ||
            !existingMovement[builtStructure.structureType]?.moveFrom.some(
                (pos) => pos.x === builtStructure.pos.x && pos.y === builtStructure.pos.y,
            )

        if (isNewAddition) {
            Logger.warning(
                'calculateBuildingDiff:moveFrom',
                `📍 ${builtStructure.structureType} at (${builtStructure.pos.x},${builtStructure.pos.y}) in ${room.name} NOT in features at that position`,
                `Will be added to moveFrom list (marked for destruction)`,
            )
        }

        if (!diff[builtStructure.structureType]) {
            diff[builtStructure.structureType] = {
                moveTo: [],
                moveFrom: [{ x: builtStructure.pos.x, y: builtStructure.pos.y }],
            }
        } else {
            diff[builtStructure.structureType].moveFrom.push({
                x: builtStructure.pos.x,
                y: builtStructure.pos.y,
            })
        }
    }
    for (const structureType of Object.keys(features)) {
        if (!isObstacle(structureType as BuildableStructureConstant)) {
            continue
        }
        const positions = features[structureType as BuildableStructureConstant]
        if (positions === undefined) {
            continue
        }
        for (const pos of positions) {
            const match = builtStructures.find(
                (structure) =>
                    structure.pos.x === pos.x &&
                    structure.pos.y === pos.y &&
                    structure.structureType !== structureType &&
                    isObstacle(structure.structureType),
            )
            if (!match) {
                continue
            }

            // Only warn if this is a NEW addition (not already in existing movement)
            const isNewAddition =
                !existingMovement ||
                !existingMovement[structureType as BuildableStructureConstant]?.moveTo.some(
                    (p) => p.x === pos.x && p.y === pos.y,
                )

            if (isNewAddition) {
                Logger.warning(
                    'calculateBuildingDiff:moveTo',
                    `📍 Features want ${structureType} at (${pos.x},${pos.y}) in ${room.name}`,
                    `But found ${match.structureType} there instead`,
                    `Position added to ${structureType}'s moveTo list (will clear ${match.structureType})`,
                )
            }

            if (!diff[structureType as BuildableStructureConstant]) {
                diff[structureType as BuildableStructureConstant] = {
                    moveTo: [{ x: match.pos.x, y: match.pos.y }],
                    moveFrom: [],
                }
            } else {
                diff[structureType as BuildableStructureConstant].moveTo.push({
                    x: match.pos.x,
                    y: match.pos.y,
                })
            }
        }
    }
    return diff
}

/**
 * Assigns construction features to rooms that need updates.
 * Only runs when CPU bucket is sufficient.
 */
const assignRoomFeatures = Profiling.wrap(() => {
    if (Game.cpu.bucket <= MIN_SURVEY_CPU) {
        return
    }
    for (const [name, memory] of Object.entries(Memory.rooms)) {
        if (
            memory.scout &&
            semverGte(memory.scout.version, '1.1.0') &&
            constructionFeaturesV3NeedsUpdate(name)
        ) {
            setConstructionFeaturesV3(name)
            return
        }
    }
}, 'assignRoomFeatures')

/**
 * Checks if a room has sufficient workers to handle spawn relocation.
 * Requires at least 1 workers with more than 1400 ticks to live.
 * @param room - The room to check for workers
 * @returns True if the room has sufficient workers, false otherwise
 */
function hasSufficientWorkersForSpawnRelocation(room: Room): boolean {
    const workers = getLogisticsCreeps({ room, preference: PREFERENCE_WORKER })
    const healthyWorkers = workers.filter((worker) => (worker.ticksToLive ?? 0) > 1400)
    return healthyWorkers.length >= 1
}

/**
 * Clears invalid structures and construction sites from rooms.
 * Handles structure movement when features don't match built structures.
 * Only processes rooms that have pending movement to minimize CPU usage.
 */
const clearRooms = Profiling.wrap(() => {
    // Filter rooms to only those with pending movement (owned or reserved with movement defined)
    const roomsWithMovement = Object.values(Game.rooms).filter((room) => {
        if (!room.controller) {
            return false
        }
        // Check if room is owned or reserved by us
        const isOwnedOrReserved =
            room.controller.my || room.controller.reservation?.username === global.USERNAME

        if (!isOwnedOrReserved) {
            return false
        }

        // Only include rooms that have pending movement
        const constructionFeatures = getConstructionFeaturesV3(room)
        // Type narrowing: only base and mine types have movement property
        if (!constructionFeatures || constructionFeatures.type === 'none') {
            return false
        }
        return constructionFeatures.movement !== undefined
    })

    // Early exit if no rooms need processing
    if (roomsWithMovement.length === 0) {
        return
    }

    // Process rooms with pending movement
    for (const room of roomsWithMovement) {
        const constructionFeatures = getConstructionFeaturesV3(room)
        const features = getConstructionFeatures(room)

        if (!constructionFeatures || !features || constructionFeatures.type === 'none') {
            continue
        }

        if (!constructionFeatures.movement) {
            continue // Should not happen due to filter above, but be safe
        }

        // Check if we have sufficient workers before destroying spawn
        const movementHasSpawn = constructionFeatures.movement.spawn !== undefined
        // Only apply spawn safety checks if this room's movement involves spawn
        if (movementHasSpawn) {
            if (findSpawnlessRooms().length > 0 || findSpawnRooms().length === 1) {
                continue
            }
            if (!hasSufficientWorkersForSpawnRelocation(room)) {
                Logger.warning(
                    'clearRooms:insufficient-workers',
                    room.name,
                    'Waiting for 1 workers with > 1400 TTL before relocating spawn',
                )
                continue
            }
        }

        constructionFeatures.movement = calculateBuildingDiff(
            room,
            features,
            constructionFeatures.movement ?? undefined,
        )
        clearInvalidConstructionSites(room, features)
        destroyMovementStructures(room)
        // Note: movement will be cleared by handleMovementEventLog when all structures are destroyed
    }
}, 'clearRooms')

/**
 * Removes construction sites that don't match planned features.
 * @param room - The room to clear sites in
 * @param features - The planned construction features
 */
function clearInvalidConstructionSites(room: Room, features: ConstructionFeatures) {
    const sites = getConstructionSites(room)
    for (const site of sites) {
        const buildings = features[site.structureType]
        if (buildings?.some((pos) => pos.x === site.pos.x && pos.y === site.pos.y)) {
            continue
        }

        // Special case: allow virtual storage containers (before RCL 4)
        if (site.structureType === STRUCTURE_CONTAINER) {
            const storagePos = features[STRUCTURE_STORAGE]?.[0]
            if (
                storagePos &&
                (room.controller?.level ?? 0) < 4 &&
                site.pos.x === storagePos.x &&
                site.pos.y === storagePos.y
            ) {
                continue // This is a valid virtual storage container
            }

            // Special case: allow virtual controller link containers (before RCL 5)
            const links = getCalculatedLinks(room)
            if (links && (room.controller?.level ?? 0) < 5) {
                const controllerLink = links.controller
                if (
                    controllerLink &&
                    site.pos.x === controllerLink.x &&
                    site.pos.y === controllerLink.y
                ) {
                    continue // This is a valid virtual controller link container
                }
            }
        }

        Logger.warning('clearInvalidConstructionSites:removed', site.structureType, site.pos)
        site.remove()
    }
}

/** Calculates movement data for all visible rooms that need it. */
function calculateRoomMovement() {
    for (const room of Object.values(Game.rooms)) {
        const constructionFeaturesV3 = getConstructionFeaturesV3(room)
        const features = getConstructionFeatures(room)
        if (
            !constructionFeaturesV3 ||
            constructionFeaturesV3.type === 'none' ||
            constructionFeaturesV3.movement !== null ||
            !features
        ) {
            continue
        }
        constructionFeaturesV3.movement = calculateBuildingDiff(
            room,
            features,
            constructionFeaturesV3.movement ?? undefined,
        )
    }
}

/**
 * Main survey function that runs all room analysis tasks.
 * Assigns features, calculates movement, and clears invalid structures.
 */
const survey = Profiling.wrap(() => {
    assignRoomFeatures()
    calculateRoomMovement()
    clearRooms()
}, 'survey')

export default survey
