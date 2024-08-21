import semverGte from 'semver/functions/gte'

import {
    ConstructionFeatures,
    ConstructionFeaturesV3,
    isStationaryBase,
    Links,
    StationaryPoints,
    StationaryPointsBase,
} from 'types'

declare global {
    interface RoomMemory {
        constructionFeaturesV3?: ConstructionFeaturesV3
    }
}

export const MIN_CONSTRUCTION_FEATURES_V3_VERSION = '1.0.7'
export const CONSTRUCTION_FEATURES_V3_VERSION = '1.0.7'

export function getConstructionFeaturesV3(room: Room): ConstructionFeaturesV3 | null {
    return getConstructionFeaturesV3FromMemory(room.memory)
}

export function getConstructionFeatures(room: Room): ConstructionFeatures | null {
    const constructionFeaturesV3 = getConstructionFeaturesV3FromMemory(room.memory)
    if (constructionFeaturesV3) {
        return constructionFeaturesV3.features ?? null
    }
    return null
}

export function getConstructionFeaturesV3FromMemory(
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

export function getStationaryPointsFromMemory(
    roomMemory: RoomMemory | undefined,
): StationaryPoints | null {
    const constructionFeaturesV3 = getConstructionFeaturesV3FromMemory(roomMemory)
    if (constructionFeaturesV3) {
        return constructionFeaturesV3.points ?? null
    }
    return null
}

export function getConstructionFeaturesFromMemory(
    roomMemory: RoomMemory | undefined,
): ConstructionFeatures | null {
    if (!roomMemory) {
        return null
    }
    const constructionFeaturesV3 = getConstructionFeaturesV3FromMemory(roomMemory)
    if (constructionFeaturesV3) {
        return constructionFeaturesV3.features ?? null
    }
    return null
}

export function getValidConstructionFeaturesV3(room: Room): ConstructionFeaturesV3 | null {
    if (
        room.memory.constructionFeaturesV3?.version === CONSTRUCTION_FEATURES_V3_VERSION &&
        !room.memory.constructionFeaturesV3.wipe
    ) {
        return room.memory.constructionFeaturesV3
    }
    return null
}

export function getCalculatedLinks(room: Room): Links | null {
    const constructionFeaturesV3 = getValidConstructionFeaturesV3(room)
    if (constructionFeaturesV3 && constructionFeaturesV3.links) {
        return constructionFeaturesV3.links
    }
    return null
}

export function getStationaryPoints(room: Room): StationaryPoints | null {
    const constructionFeaturesV3 = getValidConstructionFeaturesV3(room)
    if (constructionFeaturesV3 && constructionFeaturesV3.points) {
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
