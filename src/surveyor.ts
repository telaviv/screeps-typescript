import * as Profiling from 'utils/profiling'
import {
    ConstructionFeatures,
    ConstructionFeaturesV2,
    Links,
    Position,
    StationaryPoints,
} from 'types'
import { ImmutableRoom, fromRoom } from 'utils/immutable-room'
import calculateRoadPositions from 'room-analysis/calculate-road-positions'
import { each } from 'lodash'
import { hasBuildingAt } from 'utils/room'
import { minCutWalls } from 'screeps-min-cut-wall'

export const CONSTRUCTION_FEATURES_VERSION = '1.0.1'
export const STATIONARY_POINTS_VERSION = '1.0.1'
export const LINKS_VERSION = '1.0.0'

declare global {
    interface RoomMemory {
        constructionFeaturesV2?: ConstructionFeaturesV2
        stationaryPoints?: StationaryPoints
        links?: Links
    }

    namespace NodeJS {
        interface Global {
            clearConstructionFeatures(roomName: string): void
            clearAllConstructionFeatures(): void
            calculateSurveyImmutableRoom(room: Room): ImmutableRoom
        }
    }
}

global.clearConstructionFeatures = clearConstructionFeatures
global.calculateSurveyImmutableRoom = calculateSurveyImmutableRoom
global.clearAllConstructionFeatures = clearAllConstructionFeatures

export function getConstructionFeatures(room: Room): ConstructionFeatures | null {
    if (room.memory.constructionFeaturesV2?.version === CONSTRUCTION_FEATURES_VERSION) {
        return room.memory.constructionFeaturesV2.features
    }
    return null
}

export function getCalculatedLinks(room: Room): Links | null {
    if (room.memory.links?.version === LINKS_VERSION) {
        return room.memory.links
    }
    return null
}

function clearConstructionFeatures(roomName: string) {
    Memory.rooms[roomName].constructionFeaturesV2 = undefined
    Memory.rooms[roomName].stationaryPoints = undefined
}

function clearAllConstructionFeatures() {
    each(Game.rooms, (room: Room) => {
        clearConstructionFeatures(room.name)
    })
}

function saveConstructionFeatures(room: Room) {
    if (Game.cpu.bucket > 1000) {
        // if we update construction features let's update everything
        if (room.memory.constructionFeaturesV2?.version !== CONSTRUCTION_FEATURES_VERSION) {
            const features = calculateConstructionFeatures(room)
            const links = calculateLinks(room)
            const stationaryPoints = calculateStationaryPoints(room)
            room.memory.constructionFeaturesV2 = {
                features,
                version: CONSTRUCTION_FEATURES_VERSION,
            }
            room.memory.links = links
            room.memory.stationaryPoints = stationaryPoints
        } else {
            if (room.memory.links?.version !== LINKS_VERSION) {
                const links = calculateLinks(room)
                room.memory.links = links
            }

            if (room.memory.stationaryPoints?.version !== STATIONARY_POINTS_VERSION) {
                const stationaryPoints = calculateStationaryPoints(room)
                room.memory.stationaryPoints = stationaryPoints
            }
        }
    }
}

function calculateLinks(room: Room): Links {
    const iroom = calculateSurveyImmutableRoom(room)
    const linkTypes = iroom.linkTypes()
    const sourceTypes = [] as { source: Id<Source>; container: Position; link: Position }[]
    for (const { source, container, link } of linkTypes.sourceContainers) {
        const sources = room.find(FIND_SOURCES, { filter: { pos: { x: source.x, y: source.y } } })
        if (sources.length === 0) {
            throw new Error(`No source found at ${source.x}, ${source.y} @ room ${room.name}`)
        }
        sourceTypes.push({
            source: sources[0].id,
            container: { x: container.x, y: container.y },
            link: { x: link.x, y: link.y },
        })
    }
    return {
        version: LINKS_VERSION,
        controller: linkTypes.controller,
        storage: linkTypes.storage,
        sourceContainers: sourceTypes,
    }
}

export function isConstructionFeaturesUpToDate(room: Room): boolean {
    return Boolean(
        room.memory.constructionFeaturesV2 &&
            room.memory.constructionFeaturesV2.version === CONSTRUCTION_FEATURES_VERSION,
    )
}

function calculateConstructionFeatures(room: Room): ConstructionFeatures {
    if (
        room.memory.constructionFeaturesV2 &&
        room.memory.constructionFeaturesV2.version === CONSTRUCTION_FEATURES_VERSION
    ) {
        return room.memory.constructionFeaturesV2.features
    }
    const iroom = calculateSurveyImmutableRoom(room)

    const features = {
        [STRUCTURE_EXTENSION]: iroom.sortedExtensionPositions(),
        [STRUCTURE_TOWER]: iroom.sortedTowerPositions(),
        [STRUCTURE_STORAGE]: iroom.getObstacles('storage').map((pos) => ({ x: pos.x, y: pos.y })),
        [STRUCTURE_LINK]: iroom.sortedLinkPositions(),
        [STRUCTURE_CONTAINER]: iroom
            .getNonObstacles('container')
            .map((pos) => ({ x: pos.x, y: pos.y })),
        [STRUCTURE_SPAWN]: iroom.getObstacles('spawn').map((pos) => ({ x: pos.x, y: pos.y })),
        [STRUCTURE_RAMPART]: [] as Position[],
        [STRUCTURE_ROAD]: [] as Position[],
    }
    const positions = (Object.values(features) as Position[][]).reduce(
        (acc: Position[], val: Position[]) => acc.concat(val),
        [] as Position[],
    )
    features[STRUCTURE_RAMPART] = getRampartPositions(room, positions)
    features[STRUCTURE_ROAD] = calculateRoadPositions(room, iroom, features)
    return features
}

function calculateStationaryPoints(room: Room): StationaryPoints {
    const iroom = calculateSurveyImmutableRoom(room)
    const stationaryPoints = iroom.getStationaryPoints()
    const sources: { [id: string]: Position } = {}
    for (const { source, point } of stationaryPoints.sourceContainerLinks) {
        const psources = room.find(FIND_SOURCES, { filter: { pos: { x: source.x, y: source.y } } })
        if (psources.length === 0) {
            throw new Error(`No source found at ${source.x}, ${source.y} @ room ${room.name}`)
        }
        sources[psources[0].id] = { x: point.x, y: point.y }
    }

    return {
        version: STATIONARY_POINTS_VERSION,
        sources,
        controllerLink: stationaryPoints.controllerLink,
        storageLink: stationaryPoints.storageLink,
    }
}

function calculateSurveyImmutableRoom(room: Room): ImmutableRoom {
    let iroom: ImmutableRoom = fromRoom(room)
    iroom = iroom.setStorage()
    iroom = iroom.setSourceContainers()
    iroom = iroom.setSourceContainerLinks()
    iroom = iroom.setStorageLink()
    iroom = iroom.setControllerLink()
    iroom = iroom.setSpawns()
    iroom = iroom.setExtensions()
    iroom = iroom.setTowers()
    return iroom
}

function getRampartPositions(room: Room, features: Position[]): Position[] {
    type Position = [number, number]
    const isCenter = (pos: Position): boolean => {
        return features.some((feature) => feature.x === pos[0] && feature.y === pos[1])
    }
    const isWall = (pos: Position): boolean => {
        return (
            room.getTerrain().get(pos[0], pos[1]) === TERRAIN_MASK_WALL ||
            hasBuildingAt(new RoomPosition(pos[0], pos[1], room.name), STRUCTURE_WALL)
        )
    }
    const positions = minCutWalls({ isCenter, isWall })
    return positions.map((pos) => ({ x: pos[0], y: pos[1] }))
}

const assignRoomFeatures = Profiling.wrap(() => {
    each(Game.rooms, (room: Room) => {
        if (room.controller && room.controller.my) {
            saveConstructionFeatures(room)
        }
    })
}, 'assignRoomFeatures')

const survey = Profiling.wrap(() => {
    assignRoomFeatures()
}, 'survey')

export default survey
