import { each } from 'lodash'
import { minCutWalls } from 'screeps-min-cut-wall'
import semverGte from 'semver/functions/gte'

import * as Logger from 'utils/logger'
import * as Profiling from 'utils/profiling'
import {
    BaseRoomType,
    ConstructionFeatures,
    ConstructionFeaturesV3,
    ConstructionMovement,
    isObstacle,
    Links,
    Position,
    StationaryPointsBase,
    StationaryPointsMine,
} from 'types'
import {
    CONSTRUCTION_FEATURES_V3_VERSION,
    getCalculatedLinks,
    getConstructionFeatures,
    getConstructionFeaturesV3,
    getStationaryPoints,
    getValidConstructionFeaturesV3,
} from 'construction-features'
import { ImmutableRoom, fromScoutData } from 'utils/immutable-room'
import {
    findMyRooms,
    findSpawnlessRooms,
    findSpawnRooms,
    getBuildableStructures,
    getConstructionSites,
    getRoomType,
    RoomType,
} from 'utils/room'
import BUNKER from 'stamps/bunker'
import { SubscriptionEvent } from 'pub-sub/constants'
import { calculateRoadPositions } from 'room-analysis/calculate-road-positions'
import { destroyMovementStructures } from 'construction-movement'
import { publish } from 'pub-sub/pub-sub'

export const CONSTRUCTION_FEATURES_VERSION = '1.0.1'
export const STATIONARY_POINTS_VERSION = '1.1.0'
export const LINKS_VERSION = '1.0.0'

const MIN_SURVEY_CPU = 1500

declare global {
    interface RoomMemory {
        /**
         * @deprecated
         */
        calculateConstructionFeaturesV3?: void
        constructionFeaturesV3?: ConstructionFeaturesV3
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

function createConstructionFeaturesV3(
    type: BaseRoomType,
    features?: ConstructionFeatures,
): ConstructionFeaturesV3 {
    return {
        version: CONSTRUCTION_FEATURES_V3_VERSION,
        type,
        features,
    }
}

export function isSurveyComplete(room: Room): boolean {
    return Boolean(
        getConstructionFeatures(room) && getCalculatedLinks(room) && getStationaryPoints(room),
    )
}

function clearConstructionFeatures(roomName: string) {
    Memory.rooms[roomName].constructionFeaturesV3 = undefined
}

function publishConstructionFeatureChange(roomName: string) {
    publish(SubscriptionEvent.CONSTRUCTION_FEATURES_UPDATES, roomName)
}

function clearAllConstructionFeatures() {
    each(Game.rooms, (room: Room) => {
        clearConstructionFeatures(room.name)
    })
}

function saveConstructionFeatures(name: string, memory: RoomMemory) {
    if (Game.cpu.bucket <= MIN_SURVEY_CPU) {
        return
    }
    if (
        !memory.constructionFeaturesV3 ||
        memory.constructionFeaturesV3.version !== CONSTRUCTION_FEATURES_V3_VERSION
    ) {
        setConstructionFeaturesV3(name)
    }
}

function setConstructionFeaturesV3(roomName: string) {
    // we need to have already scouted the room so that we don't waste time
    // on rooms with no controller or 1 source etc ....
    const roomMemory = Memory.rooms[roomName]
    Logger.warning('setConstructionFeaturesV3:setting', roomName)
    roomMemory.constructionFeaturesV3 = calculateConstructionFeaturesV3(roomName)
    publishConstructionFeatureChange(roomName)
}

function calculateLinks(
    roomName: string,
    sourcePositions: Record<Id<Source>, Position>,
    iroom: ImmutableRoom,
): Links {
    const linkTypes = iroom.linkTypes()
    const sourceTypes = [] as { source: Id<Source>; container: Position; link: Position }[]
    for (const { source, container, link } of linkTypes.sourceContainers) {
        const sourceIds = Object.keys(sourcePositions).filter(
            (id) =>
                source.x === sourcePositions[id as Id<Source>].x &&
                source.y === sourcePositions[id as Id<Source>].y,
        )
        if (sourceIds.length === 0) {
            throw new Error(`No source found at ${source.x}, ${source.y} @ room ${roomName}`)
        }
        sourceTypes.push({
            source: sourceIds[0] as Id<Source>,
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
        room.memory.constructionFeaturesV3 &&
            room.memory.constructionFeaturesV3.version === CONSTRUCTION_FEATURES_VERSION,
    )
}

function calculateMineConstructionFeaturesV3(roomName: string): ConstructionFeaturesV3 {
    const iroom = calculateMineImmutableRoom(roomName)
    if (!iroom || !iroom.stationaryPoints.sources) {
        Logger.error('calculateMineConstructionFeaturesV3:failed', roomName)
        return createConstructionFeaturesV3('mine')
    }
    const features = {
        [STRUCTURE_CONTAINER]: iroom
            .getNonObstacles('container')
            .map((pos) => ({ x: pos.x, y: pos.y })),
    }
    const stationaryPoints: StationaryPointsMine = {
        type: 'mine',
        version: STATIONARY_POINTS_VERSION,
        sources: iroom.stationaryPoints.sources,
    }
    return {
        version: CONSTRUCTION_FEATURES_V3_VERSION,
        type: 'mine',
        features,
        points: stationaryPoints,
        movement: null, // let's calculate movement at a later time
    }
}

function calculateConstructionFeaturesV3(roomName: string): ConstructionFeaturesV3 {
    if (getRoomType(roomName) !== RoomType.ROOM) {
        return createConstructionFeaturesV3('none')
    }
    const iroom = calculateBunkerImmutableRoom(roomName)
    if (!iroom) {
        return calculateMineConstructionFeaturesV3(roomName)
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
        [STRUCTURE_ROAD]: iroom.getNonObstacles('road').map((pos) => ({ x: pos.x, y: pos.y })),
    }
    features[STRUCTURE_RAMPART] = getRampartPositions(iroom)
    const points = iroom.stationaryPoints
    if (!points || !points.controllerLink || !points.sources || !points.storageLink) {
        throw new Error('no stationary points')
    }
    const stationaryPoints: StationaryPointsBase = {
        type: 'base',
        version: STATIONARY_POINTS_VERSION,
        sources: points.sources,
        controllerLink: points.controllerLink,
        storageLink: points.storageLink,
    }
    const sourcePositions = Memory.rooms[roomName]?.scout?.sourcePositions
    if (!sourcePositions) {
        throw new Error('no scouted source positions')
    }
    const links = calculateLinks(roomName, sourcePositions, iroom)
    features[STRUCTURE_ROAD] = calculateRoadPositions(roomName, features, stationaryPoints)
    return {
        version: CONSTRUCTION_FEATURES_V3_VERSION,
        type: 'base',
        features,
        points: stationaryPoints,
        links,
        movement: null, // let's calculate movement at a later time
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

function calculateBunkerImmutableRoom(roomName: string): ImmutableRoom | null {
    const roomMemory = Memory.rooms[roomName]
    const scout = roomMemory.scout
    if (
        !scout ||
        !scout.sourcePositions ||
        !scout.controllerPosition ||
        !scout.mineralPosition ||
        Object.keys(scout.sourcePositions).length !== 2
    ) {
        return null
    }
    const sourcePositions = scout.sourcePositions
    const controllerPosition = scout.controllerPosition
    const mineralPosition = scout.mineralPosition
    const scoutData = { sourcePositions, controllerPosition, mineralPosition }
    let iroom: ImmutableRoom | null = fromScoutData(roomName, scoutData)
    if (!iroom) {
        return null
    }
    iroom = iroom.setSourceValues()
    iroom = iroom.setControllerValues()
    iroom = iroom.setBunker(BUNKER)
    if (!iroom) {
        return null
    }
    return iroom
}

function calculateMineImmutableRoom(roomName: string): ImmutableRoom | null {
    const roomMemory = Memory.rooms[roomName]
    if (!roomMemory?.scout) {
        throw new Error('no scout data ' + roomName)
    }
    const scout = roomMemory.scout
    if (!scout || !scout.sourcePositions || !scout.controllerPosition || !scout.mineralPosition) {
        return null
    }
    const sourcePositions = scout.sourcePositions
    const controllerPosition = scout.controllerPosition
    const mineralPosition = scout.mineralPosition
    const scoutData = { sourcePositions, controllerPosition, mineralPosition }
    let iroom: ImmutableRoom | null = fromScoutData(roomName, scoutData)
    if (!iroom) {
        return null
    }
    iroom = iroom.setSourceContainers()
    if (!iroom) {
        return null
    }
    return iroom
}

function getRampartPositions(iroom: ImmutableRoom): Position[] {
    type Position = [number, number]
    const isCenter = (pos: Position): boolean => {
        return Boolean(iroom.get(pos[0], pos[1]).obstacle)
    }
    const isWall = ([x, y]: Position): boolean => {
        return iroom.get(x, y).terrain === TERRAIN_MASK_WALL
    }
    const positions = minCutWalls({ isCenter, isWall })
    return positions.map((pos) => ({ x: pos[0], y: pos[1] }))
}

const assignRoomFeatures = Profiling.wrap(() => {
    for (const [name, memory] of Object.entries(Memory.rooms)) {
        if (memory.scout && semverGte(memory.scout.version, '1.1.0')) {
            saveConstructionFeatures(name, memory)
        }
    }
}, 'assignRoomFeatures')

const clearRooms = Profiling.wrap(() => {
    const myRooms = findMyRooms()
    for (const room of myRooms) {
        const constructionFeatures = getConstructionFeaturesV3(room)
        if (constructionFeatures === null) {
            // wipeRoom(room)
            Logger.error('wiping room', room.name, constructionFeatures)
            return
        }
    }
    for (const room of myRooms) {
        const constructionFeatures = getValidConstructionFeaturesV3(room)
        const features = getConstructionFeatures(room)
        if (!constructionFeatures || !features) {
            return
        }
        if (constructionFeatures.movement) {
            if (findSpawnlessRooms().length > 0 || findSpawnRooms().length === 1) {
                return
            }
            constructionFeatures.movement = calculateBuildingDiff(room, features)
            clearInvalidConstructionSites(room, features)
            destroyMovementStructures(room)
            constructionFeatures.movement = undefined
            return
        }
    }
}, 'clearRooms')

function clearInvalidConstructionSites(room: Room, features: ConstructionFeatures) {
    const sites = getConstructionSites(room)
    for (const site of sites) {
        const buildings = features[site.structureType]
        if (
            site.structureType === 'spawn' &&
            buildings?.some((pos) => pos.x === site.pos.x && pos.y === site.pos.y)
        ) {
            continue
        }
        Logger.warning('clearInvalidConstructionSites:removed', site.structureType, site.pos)
        site.remove()
    }
}

function calculateRoomMovement() {
    for (const room of Object.values(Game.rooms)) {
        const constructionFeaturesV3 = getConstructionFeaturesV3(room)
        const features = getConstructionFeatures(room)
        if (!constructionFeaturesV3 || constructionFeaturesV3.movement !== null || !features) {
            continue
        }
        constructionFeaturesV3.movement = calculateBuildingDiff(room, features)
    }
}

const survey = Profiling.wrap(() => {
    assignRoomFeatures()
    calculateRoomMovement()
    clearRooms()
}, 'survey')

export default survey
