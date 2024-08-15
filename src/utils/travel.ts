import {
    MoveOpts,
    MoveTarget,
    moveTo as moveToCartographer,
    generatePath as generatePathCartographer,
} from 'screeps-cartographer'

import { MatrixCacheManager } from 'matrix-cache'
import { MoveToReturnCode } from './creep'
import { safeRoomCallback } from './world'
import { wrap } from './profiling'

const MAX_ROOM_RANGE = 18

type MoveToTarget = _HasRoomPosition | RoomPosition | MoveTarget | RoomPosition[] | MoveTarget[]

function hasRoomPosition(target: MoveToTarget): target is _HasRoomPosition {
    return (target as _HasRoomPosition).pos !== undefined
}

function roomCallback(roomName: string): CostMatrix | boolean {
    if (!safeRoomCallback(roomName)) {
        return false
    }
    if (!Memory.rooms[roomName]) {
        return true
    }
    return MatrixCacheManager.getRoomTravelMatrix(roomName)
}

function routeCallback(fromRoom: string, toRoom: string): number | undefined {
    if (!safeRoomCallback(toRoom)) {
        return Infinity
    }
    return undefined
}

export const moveToRoom = wrap((creep: Creep, roomName: string, opts: MoveOpts = {}): ReturnType<
    typeof moveToCartographer
> => {
    return moveToCartographer(
        creep,
        { pos: new RoomPosition(25, 25, roomName), range: MAX_ROOM_RANGE },
        { roomCallback, routeCallback, swampCost: 3, ...opts },
    )
}, 'travel:moveToRoom')

export function generatePathToRoom(
    from: RoomPosition,
    roomName: string,
    opts: MoveOpts = {},
): ReturnType<typeof generatePathCartographer> {
    return generatePathCartographer(
        from,
        [{ pos: new RoomPosition(25, 25, roomName), range: MAX_ROOM_RANGE }],
        {
            roomCallback,
            routeCallback,
            ...opts,
        },
    )
}

export const moveTo = wrap((creep: Creep, target: MoveToTarget, opts: MoveOpts = {}): ReturnType<
    typeof moveToCartographer
> => {
    const err = moveToCartographer(creep, target, { roomCallback, routeCallback, ...opts })
    if (err === ERR_NO_PATH) {
        if (Array.isArray(target)) {
            target = target[0]
        }
        const pos = hasRoomPosition(target) ? target.pos : target
        if (creep.room.name === pos.roomName) {
            return moveToRoom(creep, pos.roomName, opts)
        } else {
            return moveToCartographer(creep, target, {
                swampCost: 5,
                maxOps: 2000,
                roomCallback,
                routeCallback,
                ...opts,
            })
        }
    }
    return err
}, 'travel:moveTo')

export const moveWithinRoom = wrap((creep: Creep, target: MoveTarget): MoveToReturnCode => {
    const matrix = MatrixCacheManager.getFullCostMatrix(creep.room.name)
    const nRoomCallback = (roomName: string): CostMatrix | boolean => {
        if (roomName === target.pos.roomName) {
            return matrix
        }
        return false
    }
    const nRouteCallback = (fromRoom: string, toRoom: string): number | undefined => {
        if (toRoom === target.pos.roomName) {
            return undefined
        }
        return Infinity
    }
    return moveTo(creep, target, { roomCallback: nRoomCallback, routeCallback: nRouteCallback })
}, 'creep:moveWithinRoom')
