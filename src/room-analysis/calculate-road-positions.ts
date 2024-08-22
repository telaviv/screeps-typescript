import { generatePath, MoveOpts } from 'screeps-cartographer'

import * as Logger from '../utils/logger'
import {
    ConstructableStructureConstant,
    ConstructionFeatures,
    isObstacle,
    isStationaryBase,
    Position,
    StationaryPointsBase,
} from '../types'

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
): Position[] {
    // first lets get the shortest path between the controller and each of the sources.
    if (!points || !isStationaryBase(points)) {
        Logger.error('calculateRoadPositions: missing points', roomName)
    }
    if (!features) {
        Logger.error('calculateRoadPositions: missing features', roomName)
    }

    const cm = roadGeneratingCostMatrix(roomName, features)
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
    const { storageLink, sources } = points
    if (Object.keys(sources).length !== 2) {
        Logger.error('calculateRoadPositions:sources length is not 2', roomName)
    }
    if (
        !addSourcePathsToMatrix(cm, sources, roomName, storageLink, {
            roomCallback,
            routeCallback,
            heuristicWeight: 1,
        })
    ) {
        Logger.error('calculateRoadPositions:addSourcesToMatrix failed', roomName)
        return []
    }
    return roadsFromCostMatrix(cm, roomName)
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

function addSourcePathsToMatrix(
    cm: CostMatrix,
    sources: { [id: string]: Position },
    roomName: string,
    storageLink: Position,
    opts: MoveOpts,
): boolean {
    const closeSourcePath = generatePath(
        new RoomPosition(storageLink.x, storageLink.y, roomName),
        Object.values(sources).map(
            (source) => ({ pos: new RoomPosition(source.x, source.y, roomName), range: 0 }),
            opts,
        ),
    )
    if (closeSourcePath === undefined) {
        Logger.error('calculateRoadPositions:sources path is undefined', roomName)
        return false
    }
    addRoadsToMatrix(cm, closeSourcePath)
    const closerSource = Object.values(sources).find(
        (source) =>
            source.x === closeSourcePath[closeSourcePath.length - 1].x &&
            source.y === closeSourcePath[closeSourcePath.length - 1].y,
    )
    if (!closerSource) {
        Logger.error('calculateRoadPositions:closerSource is undefined', roomName)
        return false
    }
    const furtherSource = Object.values(sources).find(
        (source) =>
            source.x !== closeSourcePath[closeSourcePath.length - 1].x ||
            source.y !== closeSourcePath[closeSourcePath.length - 1].y,
    )
    if (!furtherSource) {
        Logger.error('calculateRoadPositions:furtherSource is undefined', roomName)
        return false
    }
    Logger.error(
        `debug:(closerSource, furtherSource) (${closerSource.x}, ${closerSource.y}), (${furtherSource.x}, ${furtherSource.y})`,
        roomName,
    )
    const farSourcePath = generatePath(
        new RoomPosition(storageLink.x, storageLink.y, roomName),
        [{ pos: new RoomPosition(furtherSource.x, furtherSource.y, roomName), range: 0 }],
        opts,
    )
    if (farSourcePath === undefined) {
        Logger.error('calculateRoadPositions:farSourcePath is undefined', roomName)
        return false
    }
    addRoadsToMatrix(cm, farSourcePath)
    return true
}

function addRoadsToMatrix(cm: CostMatrix, path: RoomPosition[]): void {
    for (const pos of path) {
        cm.set(pos.x, pos.y, 1)
    }
}

function roadGeneratingCostMatrix(roomName: string, features: ConstructionFeatures): CostMatrix {
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
            buildingType !== STRUCTURE_ROAD &&
            (!isObstacle(buildingType) || !features[buildingType as ConstructableStructureConstant])
        ) {
            continue
        }
        for (const pos of features[buildingType as ConstructableStructureConstant] ?? []) {
            cm.set(pos.x, pos.y, value)
        }
    }
    return cm
}
