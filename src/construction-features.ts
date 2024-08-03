import { ConstructionFeatures, ConstructionFeaturesV3, Links, StationaryPoints } from 'types'

declare global {
    interface RoomMemory {
        constructionFeaturesV3?: ConstructionFeaturesV3
    }
}

export const CONSTRUCTION_FEATURES_V3_VERSION = '1.0.2'

export function getConstructionFeaturesV3(room: Room): ConstructionFeaturesV3 | null {
    if (room.memory.constructionFeaturesV3?.version === CONSTRUCTION_FEATURES_V3_VERSION) {
        return room.memory.constructionFeaturesV3
    }
    return null
}

export function getConstructionFeatures(room: Room): ConstructionFeatures | null {
    const constructionFeaturesV3 = getConstructionFeaturesV3FromMemory(room.memory)
    if (constructionFeaturesV3) {
        return constructionFeaturesV3.features
    }
    return null
}

export function getConstructionFeaturesV3FromMemory(
    roomMemory: RoomMemory | undefined,
    valid = true,
): ConstructionFeaturesV3 | null {
    if (!roomMemory) {
        return null
    }
    if (roomMemory.constructionFeaturesV3?.version === CONSTRUCTION_FEATURES_V3_VERSION) {
        if (valid && roomMemory.constructionFeaturesV3.wipe) {
            return null
        }
        return roomMemory.constructionFeaturesV3
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
        return constructionFeaturesV3.features
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
