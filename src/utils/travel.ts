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
    if (creep.fatigue > 0) {
        return ERR_TIRED
    }
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
    if (creep.fatigue > 0) {
        return ERR_TIRED
    }
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

export const moveWithinRoom = wrap((creep: Creep, target: MoveTarget, opts: MoveOpts = {}): MoveToReturnCode => {
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
    return moveTo(creep, target, { roomCallback: nRoomCallback, routeCallback: nRouteCallback, ...opts })
}, 'creep:moveWithinRoom')

export const followCreep = wrap((creep: Creep, target: Creep): MoveToReturnCode => {
    if (creep.fatigue > 0) {
        return ERR_TIRED
    }
    if (!creep.pos.isNearTo(target)) {
        return moveTo(creep, { pos: target.pos, range: 1 })
    }
    const diffX = target.pos.x - creep.pos.x
    const diffY = target.pos.y - creep.pos.y
    if (diffX === -1 && diffY === -1) {
        return creep.move(TOP_LEFT)
    } else if (diffX === 0 && diffY === -1) {
        return creep.move(TOP)
    } else if (diffX === 1 && diffY === -1) {
        return creep.move(TOP_RIGHT)
    } else if (diffX === -1 && diffY === 0) {
        return creep.move(LEFT)
    } else if (diffX === 1 && diffY === 0) {
        return creep.move(RIGHT)
    } else if (diffX === -1 && diffY === 1) {
        return creep.move(BOTTOM_LEFT)
    } else if (diffX === 0 && diffY === 1) {
        return creep.move(BOTTOM)
    }
    return creep.move(BOTTOM_RIGHT)
}, 'travel:followCreep')
