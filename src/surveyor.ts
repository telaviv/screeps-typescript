/* eslint @typescript-eslint/no-unused-vars: ['off'] */

import RoomPlanner from 'room-planner'
import { fromRoom } from 'utils/immutable-room'
import { hasNoSpawns } from 'utils/room'
import each from 'lodash/each'
import * as Logger from 'utils/logger'

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

const assignRoomFeatures = () => {
    each(Game.rooms, (room: Room) => {
        if (room.controller && room.controller.my && !hasNoSpawns(room)) {
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
