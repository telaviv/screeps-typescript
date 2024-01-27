/* eslint @typescript-eslint/no-unused-vars: ['off'] */

import { minCutWalls } from 'screeps-min-cut-wall'

import RoomPlanner from 'room-planner'
import { ImmutableRoom, fromRoom } from 'utils/immutable-room'
import * as RoomUtils from 'utils/room'
import { each } from 'lodash'
import * as Logger from 'utils/logger'

type ConstructionFeatures = {
    [K in BuildableStructureConstant]: { x: number, y: number }[];
};

const getSpawn = (room: Room): StructureSpawn => {
    return room.find(FIND_MY_SPAWNS)[0]
}

function assignSources(room: Room) {
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
        const roomPlanner = new RoomPlanner(room)
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
    assignSources(room)
    const iroom = fromRoom(room)
    const storageiPos = iroom.nextStoragePos()
    const storagePos = new RoomPosition(storageiPos.x, storageiPos.y, room.name)
    const linkSpot = getLinkSpot(storagePos)
    const controllerLink = iroom.controllerLinkPos()

    const roomPlanner = new RoomPlanner(room)
    roomPlanner.setStoragePosition(storagePos)
    roomPlanner.setStorageLink(linkSpot)
    roomPlanner.setControllerLink(controllerLink)


    if (!roomPlanner.planIsFinished()) {
        throw new Error(`somehow didn't finish the plan for ${room.name}`)
    }
}

/* function getRoomFeatures(room: Room): ConstructionFeatures {
    const sources = RoomUtils.getSources(room)
    const controller = room.controller
    const storage = RoomUtils.getStorage(room)
    const spawns = RoomUtils.getSpawns(room)
    const containers = RoomUtils.getContainers(room)
    const walls = RoomUtils.getWalls(room)
    const ramparts = RoomUtils.getRamparts(room)
    const extensions = RoomUtils.getExtensions(room)
    const links = RoomUtils.getLinks(room)
    const roads = RoomUtils.getRoads(room)
    const labs = RoomUtils.getLabs(room)
    const towers = RoomUtils.getTowers(room)
    const nukers = RoomUtils.getNukers(room)
    const powerSpawns = RoomUtils.getPowerSpawns(room)
    const factories = RoomUtils.getFactories(room)
    const terminals = RoomUtils.getTerminals(room)
    const extractors = RoomUtils.getExtractors(room)


}

function getRampartPositions(room: Room, features: RoomPosition[]): RoomPosition[] {
    type Position = [number, number]
    const isCenter = (pos: Position): boolean => {
        return features.some((feature) => feature.x === pos[0] && feature.y === pos[1])
    }
    const isWall = (pos: Position): boolean => {
        return room.getTerrain().get(pos[0], pos[1]) === TERRAIN_MASK_WALL
    }
    const positions = minCutWalls({ isCenter, isWall })
    return positions.map((pos) => new RoomPosition(pos[0], pos[1], room.name))
}
 */
const assignRoomFeatures = () => {
    each(Game.rooms, (room: Room) => {
        if (room.controller && room.controller.my && !RoomUtils.hasNoSpawns(room)) {
            const roomPlanner = new RoomPlanner(room)
            if (!roomPlanner.planIsFinished()) {
                planRoom(room)
            }
        }
    })
}

const survey = () => {
    assignRoomFeatures()
}

export default survey
