/* eslint @typescript-eslint/no-unused-vars: ['off'] */

import { minCutWalls } from 'screeps-min-cut-wall'

import RoomPlanner from 'room-planner'
import { ImmutableRoom, fromRoom } from 'utils/immutable-room'
import * as RoomUtils from 'utils/room'
import { each } from 'lodash'
import * as Logger from 'utils/logger'
import * as Profiling from 'utils/profiling'

type ConstructionFeatures = {
    [K in BuildableStructureConstant]?: { x: number, y: number }[];
};


declare global {
    interface RoomMemory {
        constructionFeatures?: ConstructionFeatures;
    }

    namespace NodeJS {
        interface Global {
            clearConstructionFeatures(roomName: string): void;
        }
    }
}

global.clearConstructionFeatures = clearConstructionFeatures

function clearConstructionFeatures(roomName: string) {
    Memory.rooms[roomName].constructionFeatures = undefined
}

function saveConstructionFeatures(room: Room) {
    if (!room.memory.constructionFeatures) {
        const features = calculateConstructionFeatures(room)
        room.memory.constructionFeatures = features
    }
}

const getSpawn = (room: Room): StructureSpawn => {
    return room.find(FIND_MY_SPAWNS)[0]
}

function assignSources(roomPlanner: RoomPlanner) {
    const room = roomPlanner.room
    const sources = room.find(FIND_SOURCES)
    const spawn = getSpawn(room)
    if (!spawn) {
        return
    }

    room.memory.sources = []
    for (const source of sources) {
        const path = PathFinder.search(
            spawn.pos,
            { pos: source.pos, range: 1 },
            { swampCost: 1 },
        ).path
        const pos = path[path.length - 1]
        const ppos = path[path.length - 2]
        room.memory.sources.push({
            id: source.id,
            dropSpot: {
                pos,
            },
        })
        const linkSpot = getLinkSpot(pos, ppos)
        roomPlanner.setSourceLink(source.id, linkSpot)
    }
}

function getLinkSpot(pos: RoomPosition, ignore?: RoomPosition): RoomPosition {
    const room = Game.rooms[pos.roomName]
    const iroom = fromRoom(room)
    const neighbors = iroom.getClosestNeighbors(pos.x, pos.y)
    let linkSpots = neighbors.filter((npos) => !npos.isObstacle())

    if (ignore) {
        linkSpots = linkSpots.filter(
            (npos) => !(npos.x === ignore.x && npos.y === ignore.y),
        )
    }
    if (linkSpots.length === 0) {
        Logger.debug('surveyor:getLinkSpot:failure', pos, neighbors)
        throw new Error(
            `Couldn't find a link spot (${pos.x}, ${pos.y}, ${pos.roomName})`,
        )
    }
    const linkSpot = linkSpots[Math.floor(Math.random() * linkSpots.length)]
    return new RoomPosition(linkSpot.x, linkSpot.y, pos.roomName)
}

function planRoom(room: Room) {
    Logger.info('surveyor:planRoom', room.name)
    const roomPlanner = new RoomPlanner(room)
    assignSources(roomPlanner)
    const iroom = fromRoom(room)
    const storageiPos = iroom.nextStoragePos()
    const storagePos = new RoomPosition(storageiPos.x, storageiPos.y, room.name)
    const linkSpot = getLinkSpot(storagePos)
    const controllerLink = iroom.controllerLinkPos()

    roomPlanner.setStoragePosition(storagePos)
    roomPlanner.setStorageLink(linkSpot)
    roomPlanner.setControllerLink(controllerLink)


    if (!roomPlanner.planIsFinished()) {
        throw new Error(`somehow didn't finish the plan for ${room.name}`)
    }
}

function calculateConstructionFeatures(room: Room): ConstructionFeatures {
    let iroom: ImmutableRoom = fromRoom(room)
    iroom = iroom.setStorage()
    iroom = iroom.setSourceContainers()
    iroom = iroom.setStorageLink()
    iroom = iroom.setSourceContainerLinks()
    iroom = iroom.setControllerLink()
    iroom = iroom.setExtensions()

    const features = {
        [STRUCTURE_EXTENSION]: iroom.getObstacles('extension').map((pos) => ({ x: pos.x, y: pos.y })),
        [STRUCTURE_SPAWN]: iroom.getObstacles('spawn').map((pos) => ({ x: pos.x, y: pos.y })),
        [STRUCTURE_TOWER]: iroom.getObstacles('tower').map((pos) => ({ x: pos.x, y: pos.y })),
        [STRUCTURE_STORAGE]: iroom.getObstacles('storage').map((pos) => ({ x: pos.x, y: pos.y })),
        [STRUCTURE_LINK]: iroom.getObstacles('link').map((pos) => ({ x: pos.x, y: pos.y })),
        [STRUCTURE_CONTAINER]: iroom.getNonObstacles('container').map((pos) => ({ x: pos.x, y: pos.y })),
        [STRUCTURE_RAMPART]: [] as { x: number, y: number }[],
    }
    const positions = Object.values(features).reduce((acc, val) => acc.concat(val), [])
    features[STRUCTURE_RAMPART] = getRampartPositions(room, positions)
    return features
}


function getRampartPositions(room: Room, features: { x: number, y: number }[]): { x: number, y: number }[] {
    type Position = [number, number]
    const isCenter = (pos: Position): boolean => {
        return features.some((feature) => feature.x === pos[0] && feature.y === pos[1])
    }
    const isWall = (pos: Position): boolean => {
        return room.getTerrain().get(pos[0], pos[1]) === TERRAIN_MASK_WALL
    }
    const positions = minCutWalls({ isCenter, isWall })
    return positions.map((pos) => ({ x: pos[0], y: pos[1] }))
}

const assignRoomFeatures = Profiling.wrap(() => {
    each(Game.rooms, (room: Room) => {
        if (room.controller && room.controller.my && !RoomUtils.hasNoSpawns(room)) {
            saveConstructionFeatures(room)
            const roomPlanner = new RoomPlanner(room)
            if (!roomPlanner.planIsFinished()) {
                planRoom(room)
            }
        }
    })
}, 'assignRoomFeatures')

const survey = () => {
    assignRoomFeatures();
}

export default survey;
