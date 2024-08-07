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

export const moveToRoom = wrap((roomName: string, creep: Creep):
    | ReturnType<Creep['moveByPath']>
    | ReturnType<Creep['moveTo']> => {
    if (creep.room.name === roomName) {
        return creep.moveTo(new RoomPosition(25, 25, roomName), { range: MAX_ROOM_RANGE })
    }

    const ret = PathFinder.search(
        creep.pos,
        { pos: new RoomPosition(25, 25, roomName), range: MAX_ROOM_RANGE },
        { roomCallback: roomTravelCallback, maxOps: 7500 },
    )
    if (ret.incomplete) {
        Logger.error('travel:moveToRoom:incomplete', roomName, creep.name)
        return creep.moveTo(new RoomPosition(25, 25, roomName), { range: MAX_ROOM_RANGE })
    }
    return creep.moveByPath(ret.path)
}, 'travel:moveToRoom')
