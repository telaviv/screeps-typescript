import { isEqual } from 'lodash'
import semverGte from 'semver/functions/gte'

import * as Logger from 'utils/logger'
import { FlatRoomPosition, Position } from 'types'
import { Mine } from 'managers/mine-manager'

/** Minimum version of construction features v3 considered valid */
export const MIN_CONSTRUCTION_FEATURES_V3_VERSION = '1.0.8'
/** Current version of construction features v3 data structure */
export const CONSTRUCTION_FEATURES_V3_VERSION = '1.0.10'

/** Current version of construction features data structure */
export const CONSTRUCTION_FEATURES_VERSION = '1.0.2'
/** Current version of stationary points data structure */
export const STATIONARY_POINTS_VERSION = '1.2.1'
/** Current version of links data structure */
export const LINKS_VERSION = '1.0.0'

/** Tracks structures that need to be moved from one position to another */
// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
export type ConstructionMovement = Record<
    BuildableStructureConstant,
    { moveTo: Position[]; moveFrom: Position[] }
>

/** Information about mining rooms controlled by a base room */
export interface MinerInformation {
    [roomName: string]: {
        exitPosition: FlatRoomPosition
    }
}

/** Information about the base room that controls a mine */
export interface MineeInformation {
    miner: string
    entrancePosition: FlatRoomPosition
}

/** Type of room for construction planning purposes */
export type BaseRoomType = 'base' | 'mine' | 'none'
/** Union type for all construction features v3 variants */
export type ConstructionFeaturesV3 =
    | ConstructionFeaturesV3Base
    | ConstructionFeaturesV3Mine
    | ConstructionFeaturesV3None
/** Construction features for a base (home) room with full bunker layout */
export interface ConstructionFeaturesV3Base {
    version: string
    type: 'base'
    features: ConstructionFeatures
    points: StationaryPointsBase
    links: Links
    miner: MinerInformation
    movement?: ConstructionMovement | null
}

/** Construction features for a remote mining room */
export interface ConstructionFeaturesV3Mine {
    version: string
    type: 'mine'
    features?: ConstructionFeatures
    points?: StationaryPointsMine
    minee?: MineeInformation
    movement?: ConstructionMovement | null
}

/** Construction features for rooms not used (e.g., highways, SK rooms) */
export interface ConstructionFeaturesV3None {
    version: string
    type: 'none'
}

/** Tracks differences between planned and built structures */
export type diffFeatures = {
    [K in BuildableStructureConstant]?: {
        clear: { pos: Position; structure: BuildableStructureConstant }[]
        vestigial: { pos: Position }[]
    }
}

/** Map of structure types to their planned positions */
export type ConstructionFeatures = {
    [K in BuildableStructureConstant]?: Position[]
}

/** Union type for stationary point configurations */
export type StationaryPoints = StationaryPointsBase | StationaryPointsMine

/**
 * Type guard to check if stationary points are for a base room.
 * @param x - Stationary points to check
 */
export function isStationaryBase(x: StationaryPoints): x is StationaryPointsBase {
    return x.type === 'base'
}

/** Stationary positions for a base room (harvesters, link hauler, etc.) */
export interface StationaryPointsBase {
    type: 'base'
    version: string
    sources: { [id: string]: Position }
    mineral: Position
    controllerLink: Position
    storageLink: Position
}

/** Stationary positions for a mining room (harvesters only) */
export interface StationaryPointsMine {
    type: 'mine'
    version: string
    sources: { [id: string]: Position }
}

/** Configuration for link positions and energy transfer routes */
export interface Links {
    version: string
    controller: Position
    storage: Position
    sourceContainers: {
        source: Id<Source>
        container: Position
        link: Position
    }[]
}

declare global {
    interface RoomMemory {
        constructionFeaturesV3?: ConstructionFeaturesV3
    }
}

/**
 * Gets construction features v3 for a room.
 * @param room - The room or room name to get features for
 */
export function getConstructionFeaturesV3(room: Room | string): ConstructionFeaturesV3 | null {
    const memory = typeof room === 'string' ? Memory.rooms[room] : room.memory
    return getConstructionFeaturesV3FromMemory(memory)
}

/**
 * Gets construction features v3 only if the room is a base type.
 * @param room - The room to get features for
 */
export function getConstructionFeaturesV3Base(room: Room): ConstructionFeaturesV3Base | null {
    const featuresV3 = getConstructionFeaturesV3(room)
    if (featuresV3 && featuresV3.type === 'base') {
        return featuresV3
    }
    return null
}

/**
 * Gets the structure position map from construction features.
 * @param room - The room or room name to get features for
 */
export function getConstructionFeatures(room: Room | string): ConstructionFeatures | null {
    const memory = typeof room === 'string' ? Memory.rooms[room] : room.memory
    const constructionFeaturesV3 = getConstructionFeaturesV3FromMemory(memory)
    if (constructionFeaturesV3 && constructionFeaturesV3.type !== 'none') {
        return constructionFeaturesV3.features ?? null
    }
    return null
}

/**
 * Gets construction features from room memory if version is sufficient.
 * @param roomMemory - The room's memory
 * @param minVersion - Minimum acceptable version
 */
function getConstructionFeaturesV3FromMemory(
    roomMemory: RoomMemory | undefined,
    minVersion = MIN_CONSTRUCTION_FEATURES_V3_VERSION,
): ConstructionFeaturesV3 | null {
    if (!roomMemory) {
        return null
    }
    const version = roomMemory.constructionFeaturesV3?.version ?? '0.0.0'
    if (semverGte(version, minVersion)) {
        return roomMemory.constructionFeaturesV3 ?? null
    }
    return null
}

/**
 * Gets stationary points from room memory.
 * @param roomMemory - The room's memory
 */
function getStationaryPointsFromMemory(
    roomMemory: RoomMemory | undefined,
): StationaryPoints | null {
    const constructionFeaturesV3 = getConstructionFeaturesV3FromMemory(roomMemory)
    if (constructionFeaturesV3 && constructionFeaturesV3.type !== 'none') {
        return constructionFeaturesV3.points ?? null
    }
    return null
}

/**
 * Checks if construction features need to be recalculated.
 * @param room - The room or room name to check
 */
export function constructionFeaturesV3NeedsUpdate(room: Room | string): boolean {
    const memory = typeof room === 'string' ? Memory.rooms[room] : room.memory
    if (!memory) {
        return false
    }
    const roomName = typeof room === 'string' ? room : room.name
    const featuresV3 = getConstructionFeaturesV3FromMemory(memory, CONSTRUCTION_FEATURES_V3_VERSION)
    if (!featuresV3) {
        Logger.warning('constructionFeaturesV3NeedsUpdate: no featuresV3', roomName)
        return true
    }
    if (featuresV3.type !== 'base') {
        return false
    }
    const points = getStationaryPointsFromMemory(memory)
    if (!points) {
        Logger.warning('constructionFeaturesV3NeedsUpdate: no stationaryPoints', roomName)
        return true
    }
    const mines: Mine[] | undefined = memory.mines
    const { miner: miningInfo } = featuresV3
    const memoryMines = new Set(mines ? mines.map((m) => m.name) : [])
    const featureMines = new Set(Object.keys(miningInfo ?? {}))
    const ret = !isEqual(memoryMines, featureMines)
    if (ret) {
        Logger.warning(
            'constructionFeaturesV3NeedsUpdate: mines differ',
            roomName,
            mines,
            miningInfo,
        )
        return true
    }
    for (const mine of mines ?? []) {
        if (!Memory.rooms[mine.name]) {
            return false
        }
        const constructionFeatures = getConstructionFeaturesV3(mine.name)
        if (!constructionFeatures) {
            Logger.error('debug:constructionFeaturesV3NeedsUpdate: no mine features', mine.name)
            return true
        }
        if (constructionFeatures.type !== 'mine') {
            Logger.error(
                'debug:constructionFeaturesV3NeedsUpdate: mine features not mine',
                mine.name,
            )
            return true
        }
        if (
            !constructionFeatures.points ||
            !constructionFeatures.minee ||
            !constructionFeatures.features
        ) {
            Logger.error(
                'debug:constructionFeaturesV3NeedsUpdate: mine features missing data',
                mine.name,
                Object.keys(constructionFeatures),
            )
            return true
        }
        if (constructionFeatures.minee.miner !== roomName) {
            Logger.error(
                'debug:constructionFeaturesV3NeedsUpdate: mine miner mismatch',
                mine.name,
                constructionFeatures.minee.miner,
                roomName,
            )
            return true
        }
    }
    return ret
}

/**
 * Gets the calculated link positions for a base room.
 * @param room - The room to get links for
 */
export function getCalculatedLinks(room: Room): Links | null {
    const constructionFeaturesV3 = getConstructionFeaturesV3Base(room)
    return constructionFeaturesV3?.links ?? null
}

/**
 * Gets stationary points for a room (harvester positions, etc.).
 * @param room - The room or room name
 */
export function getStationaryPoints(room: Room | string): StationaryPoints | null {
    const memory = typeof room === 'string' ? Memory.rooms[room] : room.memory
    const constructionFeaturesV3 = getConstructionFeaturesV3FromMemory(memory)
    if (
        constructionFeaturesV3 &&
        constructionFeaturesV3.type !== 'none' &&
        constructionFeaturesV3.points
    ) {
        return constructionFeaturesV3.points
    }
    return null
}

/**
 * Gets stationary points only if the room is a base type.
 * @param room - The room or room name
 */
export function getStationaryPointsBase(room: Room | string): StationaryPointsBase | null {
    const points = getStationaryPoints(room)
    if (!points || isStationaryBase(points)) {
        return points
    }
    return null
}

/**
 * Gets stationary points only if the room is a mine type.
 * @param room - The room or room name
 */
export function getStationaryPointsMine(room: Room | string): StationaryPointsMine | null {
    const points = getStationaryPoints(room)
    if (!points || points.type === 'mine') {
        return points
    }
    return null
}

/**
 * Checks if a construction site at the given position will be destroyed by movement code.
 * This happens when multiple structure types are planned for the same position.
 * @param room - The room to check
 * @param pos - Position to check
 * @param structureType - Type of structure being built
 * @returns Object with conflict info, or null if no conflict
 */
export function willBeDestroyedByMovement(
    room: Room,
    pos: { x: number; y: number },
    structureType: BuildableStructureConstant,
): { conflictingType: BuildableStructureConstant; reason: string } | null {
    const features = getConstructionFeaturesV3(room)
    if (!features || features.type === 'none' || !features.features) {
        return null
    }

    // Check if any OTHER structure type also claims this position
    for (const [otherType, positions] of Object.entries(features.features)) {
        if (otherType === structureType) {
            continue
        }

        const hasConflict = positions?.some((p) => p.x === pos.x && p.y === pos.y)
        if (hasConflict) {
            return {
                conflictingType: otherType as BuildableStructureConstant,
                reason: `Both ${structureType} and ${otherType} are planned for position (${pos.x}, ${pos.y})`,
            }
        }
    }

    return null
}

/**
 * Validates construction features for duplicate positions.
 * Only checks for conflicts between OBSTACLE structures, since ramparts/roads can overlap.
 * @param features - Construction features to validate
 * @returns Array of conflicts found (only obstacle structure conflicts)
 */
export function validateConstructionFeatures(
    features: ConstructionFeatures,
): { pos: Position; types: BuildableStructureConstant[] }[] {
    const positionMap = new Map<string, BuildableStructureConstant[]>()

    // Non-obstacle structures that can overlap with others
    const nonObstacles = new Set<string>([STRUCTURE_RAMPART, STRUCTURE_ROAD, STRUCTURE_CONTAINER])

    for (const [structureType, positions] of Object.entries(features)) {
        if (!positions) continue

        // Skip non-obstacle structures in conflict detection
        if (nonObstacles.has(structureType)) continue

        for (const pos of positions) {
            const key = `${pos.x},${pos.y}`
            const existing = positionMap.get(key) || []
            existing.push(structureType as BuildableStructureConstant)
            positionMap.set(key, existing)
        }
    }

    const conflicts: { pos: Position; types: BuildableStructureConstant[] }[] = []
    for (const [key, types] of positionMap.entries()) {
        if (types.length > 1) {
            const [x, y] = key.split(',').map(Number)
            conflicts.push({ pos: { x, y }, types })
        }
    }

    return conflicts
}
