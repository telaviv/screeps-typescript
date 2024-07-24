import { each } from 'lodash'
import { minCutWalls } from 'screeps-min-cut-wall'

import * as Logger from 'utils/logger'
import * as Profiling from 'utils/profiling'
import {
    ConstructionFeatures,
    ConstructionFeaturesV2,
    ConstructionFeaturesV3,
    ConstructionMovement,
    isObstacle,
    Links,
    Position,
    StationaryPoints,
} from 'types'
import { ImmutableRoom, addRoomStructures, fromRoom } from 'utils/immutable-room'
import {
    clearConstructionSites,
    findMyRooms,
    findSpawnlessRooms,
    getBuildableStructures,
    getConstructionSites,
    hasBuildingAt,
} from 'utils/room'
import { destroyMovementStructures, wipeRoom } from 'construction-movement'
import BUNKER from 'stamps/bunker'
import Empire from 'empire'
import { calculateBunkerRoadPositions } from 'room-analysis/calculate-road-positions'

export const CONSTRUCTION_FEATURES_VERSION = '1.0.1'
export const CONSTRUCTION_FEATURES_V3_VERSION = '1.0.2'
export const STATIONARY_POINTS_VERSION = '1.0.1'
export const LINKS_VERSION = '1.0.0'

const MIN_SURVEY_CPU = 4000

declare global {
    interface RoomMemory {
        /**
         * @deprecated
         */
        stationaryPoints?: undefined
        calculateConstructionFeaturesV3?: void
        constructionFeaturesV2?: ConstructionFeaturesV2
        constructionFeaturesV3?: ConstructionFeaturesV3
        links?: Links
    }

    namespace NodeJS {
        interface Global {
            setConstructionFeaturesV3(roomName: string): void
            clearConstructionFeatures(roomName: string): void
            clearAllConstructionFeatures(): void
            calculateSurveyImmutableRoom(room: Room): ImmutableRoom
        }
    }
}

global.setConstructionFeaturesV3 = setConstructionFeaturesV3
global.clearConstructionFeatures = clearConstructionFeatures
global.calculateSurveyImmutableRoom = calculateSurveyImmutableRoom
global.clearAllConstructionFeatures = clearAllConstructionFeatures

export function isSurveyComplete(room: Room): boolean {
    return Boolean(
        getConstructionFeatures(room) && getCalculatedLinks(room) && getStationaryPoints(room),
    )
}

export function getConstructionFeaturesV3(room: Room): ConstructionFeaturesV3 | null {
    if (room.memory.constructionFeaturesV3?.version === CONSTRUCTION_FEATURES_V3_VERSION) {
        return room.memory.constructionFeaturesV3
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

export function getConstructionFeatures(room: Room): ConstructionFeatures | null {
    const constructionFeaturesV3 = getValidConstructionFeaturesV3(room)
    if (constructionFeaturesV3) {
        return constructionFeaturesV3.features
    } else if (room.memory.constructionFeaturesV2?.version === CONSTRUCTION_FEATURES_VERSION) {
        return room.memory.constructionFeaturesV2.features
    }
    return null
}

export function getCalculatedLinks(room: Room): Links | null {
    const constructionFeaturesV3 = getValidConstructionFeaturesV3(room)
    if (constructionFeaturesV3 && constructionFeaturesV3.links) {
        return constructionFeaturesV3.links
    }
    if (room.memory.links?.version === LINKS_VERSION) {
        return room.memory.links
    }
    return null
}

export function getStationaryPoints(room: Room): StationaryPoints | null {
    const constructionFeaturesV3 = getValidConstructionFeaturesV3(room)
    if (constructionFeaturesV3 && constructionFeaturesV3.points) {
        return constructionFeaturesV3.points
    }
    if (
        room.memory.constructionFeaturesV2?.version === CONSTRUCTION_FEATURES_VERSION &&
        room.memory.constructionFeaturesV2?.points
    ) {
        return room.memory.constructionFeaturesV2.points
    }
    return null
}

function clearConstructionFeatures(roomName: string) {
    Memory.rooms[roomName].constructionFeaturesV2 = undefined
}

function clearAllConstructionFeatures() {
    each(Game.rooms, (room: Room) => {
        clearConstructionFeatures(room.name)
    })
}

function saveConstructionFeatures(room: Room) {
    if (Game.cpu.bucket <= MIN_SURVEY_CPU) {
        return
    }
    if (
        !room.memory.constructionFeaturesV3 ||
        room.memory.constructionFeaturesV3.version !== CONSTRUCTION_FEATURES_V3_VERSION
    ) {
        setConstructionFeaturesV3(room.name)
    }
}

function setConstructionFeaturesV3(roomName: string) {
    const room = Game.rooms[roomName]
    console.log('setConstructionFeaturesV3', roomName)
    let constructionFeatures = calculateConstructionFeaturesV3(room)
    if (!constructionFeatures) {
        Logger.warning(
            'setConstructionFeaturesV3:incomplete Failed to calculate construction features V3 for room',
            room.name,
        )
        constructionFeatures = { wipe: true } as ConstructionFeaturesV3
    }
    room.memory.constructionFeaturesV3 = constructionFeatures
    if (constructionFeatures.movement) {
        const constructionSites = getConstructionSites(room)
        for (const constructionSite of constructionSites) {
            if (constructionSite.structureType === STRUCTURE_SPAWN) {
                if (
                    constructionFeatures.features[STRUCTURE_SPAWN]?.find(
                        (pos) =>
                            pos.x === constructionSite.pos.x && pos.y === constructionSite.pos.y,
                    )
                ) {
                    continue
                }
                constructionSite.remove()
            }
        }
        clearConstructionSites(room)
        destroyMovementStructures(room)
        Logger.error(
            'setConstructionFeaturesV3:incomplete movement structures found in',
            room.name,
            JSON.stringify(constructionFeatures.movement),
        )
        constructionFeatures.movement = undefined
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

function calculateConstructionFeaturesV3(room: Room): ConstructionFeaturesV3 | undefined {
    const iroom = calculateBunkerImmutableRoom(room)
    if (!iroom) {
        Logger.info('calculateBunkerImmutableRoom returned falsey for room', room.name)
        return undefined
    }

    const features = {
        [STRUCTURE_EXTENSION]: iroom.sortedExtensionPositions(),
        [STRUCTURE_TOWER]: iroom.sortedTowerPositions(),
        [STRUCTURE_STORAGE]: iroom.getObstacles('storage').map((pos) => ({ x: pos.x, y: pos.y })),
        [STRUCTURE_TERMINAL]: iroom.getObstacles('terminal').map((pos) => ({ x: pos.x, y: pos.y })),
        [STRUCTURE_NUKER]: iroom.getObstacles('nuker').map((pos) => ({ x: pos.x, y: pos.y })),
        [STRUCTURE_LAB]: iroom.getObstacles('lab').map((pos) => ({ x: pos.x, y: pos.y })),
        [STRUCTURE_OBSERVER]: iroom.getObstacles('observer').map((pos) => ({ x: pos.x, y: pos.y })),
        [STRUCTURE_FACTORY]: iroom.getObstacles('factory').map((pos) => ({ x: pos.x, y: pos.y })),
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
    features[STRUCTURE_ROAD] = calculateBunkerRoadPositions(room, iroom, features)
    const points = iroom.stationaryPoints
    if (!points || !points.controllerLink || !points.sources || !points.storageLink) {
        Logger.error(
            'Failed to calculate stationary points for room',
            room.name,
            JSON.stringify(points),
        )
        return undefined
    }
    const stationaryPoints: StationaryPoints = {
        version: STATIONARY_POINTS_VERSION,
        sources: points.sources,
        controllerLink: points.controllerLink,
        storageLink: points.storageLink,
    }
    const links = calculateLinks(room)
    const movement = calculateBuildingDiff(room, features) ?? undefined
    return {
        version: CONSTRUCTION_FEATURES_V3_VERSION,
        features,
        points: stationaryPoints,
        links,
        movement,
    }
}

function calculateBuildingDiff(room: Room, features: ConstructionFeatures): ConstructionMovement {
    const diff = {} as ConstructionMovement
    const builtStructures = getBuildableStructures(room)
    for (const builtStructure of builtStructures) {
        const match = features[builtStructure.structureType]?.find(
            ({ x, y }) => x === builtStructure.pos.x && y === builtStructure.pos.y,
        )
        if (match) {
            continue
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

function calculateSurveyImmutableRoom(room: Room): ImmutableRoom {
    let iroom: ImmutableRoom = fromRoom(room)
    iroom = addRoomStructures(room, iroom)
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

function calculateBunkerImmutableRoom(room: Room): ImmutableRoom | null {
    let iroom: ImmutableRoom | null = fromRoom(room)
    iroom = iroom.setSourceValues()
    iroom = iroom.setControllerValues()
    iroom = iroom.setBunker(BUNKER)
    if (!iroom) {
        return null
    }
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
    const roomsBeingClaimed = new Empire().getRoomsBeingClaimed()
    each(Game.rooms, (room: Room) => {
        if ((room.controller && room.controller.my) || roomsBeingClaimed.includes(room.name)) {
            saveConstructionFeatures(room)
        }
    })
}, 'assignRoomFeatures')

const clearRooms = Profiling.wrap(() => {
    const myRooms = findMyRooms()
    for (const room of myRooms) {
        const constructionFeatures = getConstructionFeaturesV3(room)
        if (constructionFeatures?.wipe) {
            return
        }
        wipeRoom(room)
    }
    for (const room of myRooms) {
        const constructionFeatures = getValidConstructionFeaturesV3(room)
        if (!constructionFeatures) {
            return
        }
        if (constructionFeatures.movement) {
            if (findSpawnlessRooms().length > 0) {
                return
            }
            destroyMovementStructures(room)
            constructionFeatures.movement = undefined
            return
        }
    }
}, 'clearRooms')

const survey = Profiling.wrap(() => {
    assignRoomFeatures()
    clearRooms()
}, 'survey')

export default survey
