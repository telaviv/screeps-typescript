import { MoveOpts, MoveTarget, moveTo as moveToCartographer } from 'screeps-cartographer'

import { MatrixCacheManager } from 'matrix-cache'
import { MoveToReturnCode } from './creep'
import { safeRoomCallback } from './world'
import { wrap } from './profiling'

const MAX_ROOM_RANGE = 18

type MoveToTarget = _HasRoomPosition | RoomPosition | MoveTarget | RoomPosition[] | MoveTarget[]

function roomTravelCallback(roomName: string): CostMatrix | boolean {
    if (!safeRoomCallback(roomName)) {
        return false
    }
    if (!Memory.rooms[roomName]) {
        return true
    }
    return MatrixCacheManager.getRoomTravelMatrix(roomName)
}

export const moveToRoom = wrap((creep: Creep, roomName: string, opts: MoveOpts = {}): ReturnType<
    typeof moveToCartographer
> => {
    return moveToCartographer(
        creep,
        { pos: new RoomPosition(25, 25, roomName), range: MAX_ROOM_RANGE },
        { roomCallback: roomTravelCallback, maxOps: 4000, ...opts },
    )
}, 'travel:moveToRoom')

export const moveTo = wrap((creep: Creep, target: MoveToTarget, opts: MoveOpts = {}): ReturnType<
    typeof moveToCartographer
> => {
    const err = moveToCartographer(creep, target, { roomCallback: roomTravelCallback, ...opts })
    if (err === ERR_NO_PATH) {
        return moveToCartographer(creep, target, {
            swampCost: 5,
            maxOps: 4000,
            roomCallback: roomTravelCallback,
            ...opts,
        })
    }
    return err
}, 'travel:moveTo')

export const moveWithinRoom = wrap((creep: Creep, target: MoveTarget): MoveToReturnCode => {
    const matrix = MatrixCacheManager.getFullCostMatrix(creep.room.name)
    const callback = (roomName: string): CostMatrix | boolean => {
        if (roomName === target.pos.roomName) {
            return matrix
        }
        return false
    }
    return moveTo(creep, target, { roomCallback: callback })
}, 'creep:moveWithinRoom')
