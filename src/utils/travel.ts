import * as Logger from './logger'
import { MatrixCacheManager } from 'matrix-cache'
import { safeRoomCallback } from './world'
import { wrap } from './profiling'

const MAX_ROOM_RANGE = 18

function roomTravelCallback(roomName: string): CostMatrix | boolean {
    if (!safeRoomCallback(roomName)) {
        return false
    }
    if (!Memory.rooms[roomName]) {
        return true
    }
    return MatrixCacheManager.getRoomTravelMatrix(roomName)
}

const createInRoomCallback =
    (roomName: string) =>
    (innerRoomName: string): boolean => {
        if (roomName === innerRoomName) {
            return true
        }
        return false
    }

export const moveToRoom = wrap((roomName: string, creep: Creep):
    | ReturnType<Creep['moveByPath']>
    | ReturnType<Creep['moveTo']> => {
    if (creep.room.name === roomName) {
        return creep.moveTo(new RoomPosition(25, 25, roomName), { range: MAX_ROOM_RANGE })
    }

    const ret = PathFinder.search(
        creep.pos,
        { pos: new RoomPosition(25, 25, roomName), range: MAX_ROOM_RANGE },
        { roomCallback: roomTravelCallback, maxOps: 2000 },
    )
    if (ret.incomplete) {
        Logger.info('travel:moveToRoom:incomplete', roomName, creep.name)
        return creep.moveTo(new RoomPosition(25, 25, roomName), { range: MAX_ROOM_RANGE })
    }
    return creep.moveByPath(ret.path)
}, 'travel:moveToRoom')

/* eslint-disable @typescript-eslint/no-inferrable-types */
export const moveToSafe = wrap((creep: Creep, pos: RoomPosition, range: number = 1):
    | ReturnType<Creep['moveByPath']>
    | ReturnType<Creep['moveTo']> => {
    if (creep.room.name === pos.roomName) {
        return creep.moveTo(pos, { range })
    }
    const roomCallback =
        creep.room.name === pos.roomName ? createInRoomCallback(pos.roomName) : roomTravelCallback
    const ret = PathFinder.search(creep.pos, { pos, range }, { roomCallback, maxOps: 2000 })
    if (ret.incomplete) {
        Logger.info('travel:moveToSafe:incomplete', pos, creep.name)
        if (creep.room.name === pos.roomName) {
            return creep.moveTo(pos, { range, swampCost: 1 })
        }
        return moveToRoom(pos.roomName, creep)
    }
    return creep.moveByPath(ret.path)
}, 'travel:moveToSafe')
