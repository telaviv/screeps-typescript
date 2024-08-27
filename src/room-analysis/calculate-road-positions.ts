/* eslint-disable @typescript-eslint/no-unused-vars */

import { generatePath, MoveOpts } from 'screeps-cartographer'

import * as Logger from '../utils/logger'
import { ConstructableStructureConstant, FlatRoomPosition, isObstacle, Position } from '../types'
import {
    ConstructionFeatures,
    StationaryPointsBase,
    isStationaryBase,
} from '../construction-features'
import { Mine } from 'managers/mine-manager'
import { printMatrix } from 'matrix-cache'

export interface PositionEdge {
    a: string
    b: string
    weight: number
}

const roadSortOrder =
    (roomName: string) =>
    (a: Position, b: Position): number => {
        const terrain = new Room.Terrain(roomName)
        const terrainValue = (pos: Position) =>
            terrain.get(pos.x, pos.y) === TERRAIN_MASK_SWAMP ? 0 : 1
        return terrainValue(a) - terrainValue(b)
    }

export function calculateRoadPositions(
    roomName: string,
    features: ConstructionFeatures,
    points: StationaryPointsBase,
    mines: Mine[],
): { roads: Position[]; exitInfo: ExitInformation } {
    // first lets get the shortest path between the controller and each of the sources.
    if (!points || !isStationaryBase(points)) {
        Logger.error('calculateRoadPositions: missing points', roomName)
    }
    if (!features) {
        Logger.error('calculateRoadPositions: missing features', roomName)
    }

    const cm = roadGeneratingCostMatrix(roomName, features, points)
    const roomCallback = (cbRoomName: string): CostMatrix | boolean => {
        if (cbRoomName === roomName) {
            return cm
        }
        return false
    }
    const routeCallback = (fromRoom: string, toRoom: string): number | undefined => {
        if (toRoom === roomName) {
            return undefined
        }
        return Infinity
    }
    const opts: MoveOpts = { roomCallback, routeCallback, heuristicWeight: 1 }
    const { storageLink, sources, controllerLink } = points
    if (Object.keys(sources).length !== 2) {
        Logger.error('calculateRoadPositions:sources length is not 2', roomName)
    }
    if (!addSourcePathsToMatrix(cm, sources, roomName, storageLink, opts)) {
        Logger.error('calculateRoadPositions:addSourcesToMatrix failed', roomName)
        return { roads: [], exitInfo: [] }
    }
    if (!addControllerLinkPathToMatrix(cm, controllerLink, roomName, storageLink, opts)) {
        Logger.error('calculateRoadPositions:addControllerLinkPathToMatrix failed', roomName)
        return { roads: [], exitInfo: [] }
    }
    const exitInfo = addMineRoadsToMatrix(cm, mines, roomName, storageLink, cm)
    if (!exitInfo) {
        Logger.error('calculateRoadPositions:addMineRoadsToMatrix failed', roomName)
        return { roads: [], exitInfo: [] }
    }
    // we've set the storage to 1 to allow pathfinding. let's quit that
    cm.set(storageLink.x, storageLink.y, 255)
    return { roads: roadsFromCostMatrix(cm, roomName), exitInfo }
}

export function calculateMineConstructionFeaturesV3(
    roomName: string,
    startPosition: FlatRoomPosition,
): { features: ConstructionFeatures; points: { [id: Id<Source>]: Position } } | null {
    const cm = roadGeneratingCostMatrix(roomName, {})
    const roomCallback = (cbRoomName: string): CostMatrix | boolean => {
        if (cbRoomName === roomName) {
            return cm
        }
        return false
    }
    const routeCallback = (fromRoom: string, toRoom: string): number | undefined => {
        if (toRoom === roomName) {
            return undefined
        }
        return Infinity
    }
    const scout = Memory.rooms[roomName].scout
    if (!scout || !scout.sourcePositions) {
        Logger.error('calculateRoadPositions:mine scout is undefined', roomName)
        return null
    }
    const moveTarget = Object.values(scout.sourcePositions).map(({ x, y }) => ({
        pos: new RoomPosition(x, y, roomName),
        range: 1,
    }))
    const opts: MoveOpts = { roomCallback, routeCallback, heuristicWeight: 1 }
    const closeSourcePath = generatePath(
        new RoomPosition(startPosition.x, startPosition.y, roomName),
        moveTarget,
        opts,
    )
    if (closeSourcePath === undefined || closeSourcePath.length === 0) {
        Logger.error('calculateRoadPositions:mine path is undefined', roomName)
        return null
    }
    const closeSourceContainer = closeSourcePath[closeSourcePath.length - 1]
    const closeSourceEntry = Object.entries(scout.sourcePositions).find(
        ([_, pos]) => closeSourceContainer.isNearTo(pos.x, pos.y) === true,
    )
    if (!closeSourceEntry) {
        Logger.error('calculateRoadPositions:mine close source is undefined', roomName)
        return null
    }
    const closeSourceId = closeSourceEntry[0]
    addRoadsToMatrix(cm, closeSourcePath)
    cm.set(closeSourceContainer.x, closeSourceContainer.y, 255)

    let furtherSourceContainer
    let furtherSourceId
    if (Object.keys(scout.sourcePositions).length === 2) {
        const furtherSourceEntry = Object.entries(scout.sourcePositions).find(
            ([_, pos]) => closeSourceContainer.isNearTo(pos.x, pos.y) === false,
        )
        if (!furtherSourceEntry) {
            Logger.error('calculateRoadPositions:mine further source is undefined', roomName)
            return null
        }
        furtherSourceId = furtherSourceEntry[0]
        const furtherSource = furtherSourceEntry[1]
        const furtherSourcePath = generatePath(
            new RoomPosition(startPosition.x, startPosition.y, roomName),
            [{ pos: new RoomPosition(furtherSource.x, furtherSource.y, roomName), range: 1 }],
            opts,
        )
        if (furtherSourcePath === undefined || furtherSourcePath.length === 0) {
            Logger.error('calculateRoadPositions:mine further path is undefined', roomName)
            return null
        }
        furtherSourceContainer = furtherSourcePath[furtherSourcePath.length - 1]
        addRoadsToMatrix(cm, furtherSourcePath)
        cm.set(furtherSourceContainer.x, furtherSourceContainer.y, 255)
    }
    if (scout.controllerPosition === undefined) {
        Logger.error('calculateRoadPositions:mine controller position is undefined', roomName)
        return null
    }
    const controllerPath = generatePath(
        new RoomPosition(startPosition.x, startPosition.y, roomName),
        [
            {
                pos: new RoomPosition(
                    scout.controllerPosition.x,
                    scout.controllerPosition.y,
                    roomName,
                ),
                range: 1,
            },
        ],
        { roomCallback, routeCallback, heuristicWeight: 1 },
    )
    if (controllerPath === undefined || controllerPath.length === 0) {
        Logger.error('calculateRoadPositions:mine controller path is undefined', roomName)
        return null
    }
    addRoadsToMatrix(cm, controllerPath)
    cm.set(scout.controllerPosition.x, scout.controllerPosition.y, 255)
    cm.set(startPosition.x, startPosition.y, 255)
    const sources = { [closeSourceId]: closeSourceContainer }
    if (furtherSourceContainer && furtherSourceId) {
        sources[furtherSourceId] = furtherSourceContainer
    }
    return {
        features: {
            [STRUCTURE_ROAD]: roadsFromCostMatrix(cm, roomName),
            [STRUCTURE_CONTAINER]: Object.values(sources).map(({ x, y }) => ({ x, y })),
        },
        points: sources,
    }
}

function roadsFromCostMatrix(cm: CostMatrix, roomName: string): Position[] {
    const roadPositions: Position[] = []
    for (let x = 0; x < 50; x++) {
        for (let y = 0; y < 50; y++) {
            if (cm.get(x, y) === 1) {
                roadPositions.push({ x, y })
            }
        }
    }
    roadPositions.sort(roadSortOrder(roomName))
    return roadPositions
}
type ExitInformation = {
    name: string
    exitPosition: FlatRoomPosition
    entrancePosition: FlatRoomPosition
}[]
function addMineRoadsToMatrix(
    cm: CostMatrix,
    mines: Mine[],
    roomName: string,
    storageLink: Position,
    startRoomCostMatrix: CostMatrix,
): ExitInformation | null {
    const exitInfo: ExitInformation = []
    for (const mine of mines) {
        const mineCostMatrix = roadGeneratingCostMatrix(mine.name, {})
        const roomCallback = (cbRoomName: string): CostMatrix | boolean => {
            if (cbRoomName === mine.name) {
                return mineCostMatrix
            } else if (cbRoomName === roomName) {
                return startRoomCostMatrix
            }
            return false
        }
        const routeCallback = (fromRoom: string, toRoom: string): number | undefined => {
            if (toRoom === mine.name || toRoom === roomName) {
                return undefined
            }
            return Infinity
        }
        if (!Memory.rooms[mine.name]) {
            Logger.error(
                'calculateRoadPositions:mine Memory.rooms is undefined',
                roomName,
                mine.name,
            )
        }
        const scout = Memory.rooms[mine.name].scout
        if (!scout || !scout.sourcePositions) {
            Logger.error('calculateRoadPositions:mine scout is undefined', roomName, mine.name)
            return null
        }
        const moveTarget = Object.values(scout.sourcePositions).map(({ x, y }) => ({
            pos: new RoomPosition(x, y, mine.name),
            range: 1,
        }))
        const path = generatePath(
            new RoomPosition(storageLink.x, storageLink.y, roomName),
            moveTarget,
            { roomCallback, routeCallback, heuristicWeight: 1 },
        )
        if (path === undefined) {
            Logger.error('calculateRoadPositions:mine path is undefined', roomName)
            return null
        }
        const minerPath = path.filter((pos) => pos.roomName === roomName)
        const mineePath = path.filter((pos) => pos.roomName === mine.name)
        if (minerPath.length === 0 || mineePath.length === 0) {
            Logger.error('calculateRoadPositions:mine entrance or exit is undefined', roomName)
            return null
        }
        const exitPosition = minerPath[minerPath.length - 1]
        const entrancePosition = mineePath[0]
        addRoadsToMatrix(cm, minerPath.slice(0, -1)) // slice off the end since you can't build there
        exitInfo.push({ name: mine.name, exitPosition, entrancePosition })
    }
    return exitInfo
}

function addControllerLinkPathToMatrix(
    cm: CostMatrix,
    controllerLink: Position,
    roomName: string,
    storageLink: Position,
    opts: MoveOpts,
): boolean {
    cm.set(controllerLink.x, controllerLink.y, 1)
    const path = generatePath(
        new RoomPosition(storageLink.x, storageLink.y, roomName),
        [{ pos: new RoomPosition(controllerLink.x, controllerLink.y, roomName), range: 0 }],
        opts,
    )
    if (path === undefined) {
        Logger.error('calculateRoadPositions:controller path is undefined', roomName)
        return false
    }
    addRoadsToMatrix(cm, path)
    cm.set(controllerLink.x, controllerLink.y, 255)
    return true
}

function addSourcePathsToMatrix(
    cm: CostMatrix,
    sources: { [id: string]: Position },
    roomName: string,
    storageLink: Position,
    opts: MoveOpts,
): boolean {
    // for now let's pretend the sources are roads
    for (const source of Object.values(sources)) {
        cm.set(source.x, source.y, 1)
    }
    const closeSourcePath = generatePath(
        new RoomPosition(storageLink.x, storageLink.y, roomName),
        Object.values(sources).map(
            (source) => ({ pos: new RoomPosition(source.x, source.y, roomName), range: 0 }),
            opts,
        ),
    )
    if (closeSourcePath === undefined) {
        Logger.error('calculateRoadPositions:sources path is undefined', roomName)
        printMatrix(cm)
        return false
    }
    const closerSource = Object.values(sources).find(
        (source) =>
            source.x === closeSourcePath[closeSourcePath.length - 1].x &&
            source.y === closeSourcePath[closeSourcePath.length - 1].y,
    )
    const furtherSource = Object.values(sources).find(
        (source) =>
            source.x !== closeSourcePath[closeSourcePath.length - 1].x ||
            source.y !== closeSourcePath[closeSourcePath.length - 1].y,
    )

    if (!furtherSource) {
        Logger.error('calculateRoadPositions:furtherSource is undefined', roomName)
        return false
    }
    if (!closerSource) {
        Logger.error('calculateRoadPositions:closerSource is undefined', roomName)
        return false
    }
    // let's make sure we don't pass through the far source
    cm.set(furtherSource.x, furtherSource.y, 255)
    const safeCloseSourcePath = generatePath(
        new RoomPosition(storageLink.x, storageLink.y, roomName),
        Object.values(sources).map(
            (source) => ({ pos: new RoomPosition(source.x, source.y, roomName), range: 0 }),
            opts,
        ),
    )
    if (safeCloseSourcePath === undefined) {
        Logger.error('calculateRoadPositions:sources:safe-close path is undefined', roomName)
        return false
    }
    addRoadsToMatrix(cm, safeCloseSourcePath)
    cm.set(closerSource.x, closerSource.y, 255)
    cm.set(furtherSource.x, furtherSource.y, 1)
    const farSourcePath = generatePath(
        new RoomPosition(storageLink.x, storageLink.y, roomName),
        [{ pos: new RoomPosition(furtherSource.x, furtherSource.y, roomName), range: 0 }],
        opts,
    )
    // now add back the 2nd point as a wall
    if (farSourcePath === undefined) {
        Logger.error('calculateRoadPositions:farSourcePath is undefined', roomName)
        return false
    }
    addRoadsToMatrix(cm, farSourcePath)
    cm.set(furtherSource.x, furtherSource.y, 255)
    return true
}

function addRoadsToMatrix(cm: CostMatrix, path: RoomPosition[]): void {
    for (const pos of path) {
        cm.set(pos.x, pos.y, 1)
    }
}

function roadGeneratingCostMatrix(
    roomName: string,
    features: ConstructionFeatures,
    points?: StationaryPointsBase,
): CostMatrix {
    const terrain = new Room.Terrain(roomName)
    const cm = new PathFinder.CostMatrix()
    for (let x = 0; x < 50; x++) {
        for (let y = 0; y < 50; y++) {
            if (terrain.get(x, y) === TERRAIN_MASK_WALL) {
                cm.set(x, y, 255)
            } else if (terrain.get(x, y) === TERRAIN_MASK_SWAMP) {
                cm.set(x, y, 3)
            } else {
                cm.set(x, y, 2)
            }
        }
    }
    for (const buildingType of Object.keys(features)) {
        let value = 255
        if (buildingType === STRUCTURE_ROAD) {
            value = 1
        }

        if (
            !features[buildingType as ConstructableStructureConstant] ||
            !(isObstacle(buildingType) || buildingType === STRUCTURE_ROAD)
        ) {
            continue
        }
        for (const pos of features[buildingType as ConstructableStructureConstant] ?? []) {
            cm.set(pos.x, pos.y, value)
        }
    }
    if (points) {
        for (const point of Object.values(points.sources)) {
            cm.set(point.x, point.y, 255)
        }
        cm.set(points.controllerLink.x, points.controllerLink.y, 255)
        // we need the storage open for pathfinding. we will reset it later
        cm.set(points.storageLink.x, points.storageLink.y, 1)
    }
    return cm
}
