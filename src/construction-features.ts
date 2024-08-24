import { isEqual } from 'lodash'
import semverGte from 'semver/functions/gte'

import * as Logger from 'utils/logger'
import { FlatRoomPosition, Position } from 'types'
import { Mine } from 'managers/mine-manager'

export const CONSTRUCTION_FEATURES_VERSION = '1.0.1'
export const STATIONARY_POINTS_VERSION = '1.1.0'
export const LINKS_VERSION = '1.0.0'

// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
export type ConstructionMovement = Record<
    BuildableStructureConstant,
    { moveTo: Position[]; moveFrom: Position[] }
>

export interface MinerInformation {
    [roomName: string]: {
        exitPosition: FlatRoomPosition
    }
}

export interface MineeInformation {
    entrancePosition: FlatRoomPosition
}

export type BaseRoomType = 'base' | 'mine' | 'none'
export type ConstructionFeaturesV3 =
    | ConstructionFeaturesV3Base
    | ConstructionFeaturesV3Mine
    | ConstructionFeaturesV3None
export interface ConstructionFeaturesV3Base {
    version: string
    type: 'base'
    features: ConstructionFeatures
    points: StationaryPointsBase
    links: Links
    miner: MinerInformation
    movement?: ConstructionMovement | null
}

export interface ConstructionFeaturesV3Mine {
    version: string
    type: 'mine'
    features?: ConstructionFeatures
    points?: StationaryPointsMine
    minee?: MineeInformation
    movement?: ConstructionMovement | null
}

export interface ConstructionFeaturesV3None {
    version: string
    type: 'none'
}

export type diffFeatures = {
    [K in BuildableStructureConstant]?: {
        clear: { pos: Position; structure: BuildableStructureConstant }[]
        vestigial: { pos: Position }[]
    }
}

export type ConstructionFeatures = {
    [K in BuildableStructureConstant]?: Position[]
}

export type StationaryPoints = StationaryPointsBase | StationaryPointsMine

export function isStationaryBase(x: StationaryPoints): x is StationaryPointsBase {
    return x.type === 'base'
}

export interface StationaryPointsBase {
    type: 'base'
    version: string
    sources: { [id: string]: Position }
    controllerLink: Position
    storageLink: Position
}

export interface StationaryPointsMine {
    type: 'mine'
    version: string
    sources: { [id: string]: Position }
}

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

export const MIN_CONSTRUCTION_FEATURES_V3_VERSION = '1.0.7'
export const CONSTRUCTION_FEATURES_V3_VERSION = '1.0.7'

export function getConstructionFeaturesV3(room: Room | string): ConstructionFeaturesV3 | null {
    const memory = typeof room === 'string' ? Memory.rooms[room] : room.memory
    return getConstructionFeaturesV3FromMemory(memory)
}

export function getConstructionFeaturesV3Base(room: Room): ConstructionFeaturesV3Base | null {
    const featuresV3 = getConstructionFeaturesV3(room)
    if (featuresV3 && featuresV3.type === 'base') {
        return featuresV3
    }
    return null
}

export function getConstructionFeatures(room: Room | string): ConstructionFeatures | null {
    const memory = typeof room === 'string' ? Memory.rooms[room] : room.memory
    const constructionFeaturesV3 = getConstructionFeaturesV3FromMemory(memory)
    if (constructionFeaturesV3 && constructionFeaturesV3.type !== 'none') {
        return constructionFeaturesV3.features ?? null
    }
    return null
}

function getConstructionFeaturesV3FromMemory(
    roomMemory: RoomMemory | undefined,
): ConstructionFeaturesV3 | null {
    if (!roomMemory) {
        return null
    }
    const version = roomMemory.constructionFeaturesV3?.version ?? '0.0.0'
    if (semverGte(version, MIN_CONSTRUCTION_FEATURES_V3_VERSION)) {
        return roomMemory.constructionFeaturesV3 ?? null
    }
    return null
}

function getStationaryPointsFromMemory(
    roomMemory: RoomMemory | undefined,
): StationaryPoints | null {
    const constructionFeaturesV3 = getConstructionFeaturesV3FromMemory(roomMemory)
    if (constructionFeaturesV3 && constructionFeaturesV3.type !== 'none') {
        return constructionFeaturesV3.points ?? null
    }
    return null
}

export function constructionFeaturesV3NeedsUpdate(room: Room | string): boolean {
    const memory = typeof room === 'string' ? Memory.rooms[room] : room.memory
    if (!memory) {
        return false
    }
    const roomName = typeof room === 'string' ? room : room.name
    const featuresV3 = getConstructionFeaturesV3FromMemory(memory)
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
    }
    return ret
}

export function getCalculatedLinks(room: Room): Links | null {
    const constructionFeaturesV3 = getConstructionFeaturesV3Base(room)
    return constructionFeaturesV3?.links ?? null
}

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

export function getStationaryPointsBase(room: Room): StationaryPointsBase | null {
    const points = getStationaryPoints(room)
    if (!points || isStationaryBase(points)) {
        return points
    }
    return null
}
