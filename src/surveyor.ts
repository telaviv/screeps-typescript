/* eslint @typescript-eslint/no-unused-vars: ['off'] */
import { minCutWalls } from 'screeps-min-cut-wall'

import { ImmutableRoom, fromRoom } from 'utils/immutable-room'
import { each } from 'lodash'
import * as Profiling from 'utils/profiling'
import { ConstructionFeatures, Position } from 'types'
import calculateRoadPositions from 'room-analysis/calculate-road-positions'
import { hasBuildingAt } from 'utils/room'

const CPU_MIN = 50

interface StationaryPoints {
    sources: { [id: string]: Position }
}

declare global {
    interface RoomMemory {
        constructionFeatures?: ConstructionFeatures
        stationaryPoints?: StationaryPoints
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

function clearConstructionFeatures(roomName: string) {
    Memory.rooms[roomName].constructionFeatures = undefined
    Memory.rooms[roomName].stationaryPoints = undefined
}

function clearAllConstructionFeatures() {
    each(Game.rooms, (room: Room) => {
        clearConstructionFeatures(room.name)
    })
}

function saveConstructionFeatures(room: Room) {
    if (!room.memory.constructionFeatures && Game.cpu.tickLimit > CPU_MIN) {
        const features = calculateConstructionFeatures(room)
        room.memory.constructionFeatures = features
    }
}

export function getConstructionFeatures(room: Room): ConstructionFeatures {
    return room.memory.constructionFeatures!
}

function calculateConstructionFeatures(room: Room): ConstructionFeatures {
    const iroom = calculateSurveyImmutableRoom(room)

    const features = {
        [STRUCTURE_EXTENSION]: iroom.sortedExtensionPositions(),
        [STRUCTURE_TOWER]: iroom.sortedTowerPositions(),
        [STRUCTURE_STORAGE]: iroom
            .getObstacles('storage')
            .map((pos) => ({ x: pos.x, y: pos.y })),
        [STRUCTURE_LINK]: iroom.sortedLinkPositions(),
        [STRUCTURE_CONTAINER]: iroom
            .getNonObstacles('container')
            .map((pos) => ({ x: pos.x, y: pos.y })),
        [STRUCTURE_SPAWN]: iroom
            .getObstacles('spawn')
            .map((pos) => ({ x: pos.x, y: pos.y })),
        [STRUCTURE_RAMPART]: [] as Position[],
        [STRUCTURE_ROAD]: [] as Position[],
    }
    const positions = (Object.values(features) as Position[][]).reduce(
        (acc: Position[], val: Position[]) => acc.concat(val),
        [] as Position[],
    )
    features[STRUCTURE_RAMPART] = getRampartPositions(room, positions)
    features[STRUCTURE_ROAD] = calculateRoadPositions(room, iroom, features)

    if (!room.memory.stationaryPoints) {
        room.memory.stationaryPoints = {
            sources: iroom.getMappedSourceContainers(),
        }
    }
    return features
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
        return features.some(
            (feature) => feature.x === pos[0] && feature.y === pos[1],
        )
    }
    const isWall = (pos: Position): boolean => {
        return (
            room.getTerrain().get(pos[0], pos[1]) === TERRAIN_MASK_WALL ||
            hasBuildingAt(
                new RoomPosition(pos[0], pos[1], room.name),
                STRUCTURE_WALL,
            )
        )
    }
    const positions = minCutWalls({ isCenter, isWall })
    return positions.map((pos) => ({ x: pos[0], y: pos[1] }))
}

const assignRoomFeatures = Profiling.wrap(() => {
    each(Game.rooms, (room: Room) => {
        if (room.controller) {
            saveConstructionFeatures(room)
        }
    })
}, 'assignRoomFeatures')

const survey = Profiling.wrap(() => {
    assignRoomFeatures()
}, 'survey')

export default survey
