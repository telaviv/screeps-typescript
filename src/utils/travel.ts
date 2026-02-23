import {
    MoveOpts,
    MoveTarget,
    moveTo as moveToCartographerUnwrapped,
    generatePath as generatePathCartographer,
} from 'screeps-cartographer'

import { DEADLOCK_THRESHOLD } from '../constants'
import { getConstructionFeaturesV3 } from 'construction-features'
import { MatrixCacheManager } from 'matrix-cache'
import BuildManager from 'managers/build-manager'
import { MoveToReturnCode } from './creep'
import { safeRoomCallback } from './world'
import { wrap } from './profiling'
import { moveToRandomNearbyPosition, updatePositionTracking } from './deadlock'
import * as Logger from './logger'

declare global {
    interface Memory {
        cartographerDebugEnabled?: boolean
    }
}

const MAX_ROOM_RANGE = 20

type MoveToTarget = _HasRoomPosition | RoomPosition | MoveTarget | RoomPosition[] | MoveTarget[]

function formatTargetForLog(target: MoveToTarget): string {
    if (Array.isArray(target)) {
        return JSON.stringify(target.map((t) => formatTargetForLog(t)))
    }
    if (typeof (target as RoomPosition).roomName === 'string') {
        const p = target as RoomPosition
        return `${p.roomName}:(${p.x},${p.y})`
    }
    if (typeof (target as _HasRoomPosition).pos !== 'undefined') {
        const t = target as _HasRoomPosition
        const range = (target as { range?: number }).range
        if (range !== undefined) {
            return `{pos:${formatTargetForLog(t.pos)},range:${range}}`
        }
        return `{pos:${formatTargetForLog(t.pos)}}`
    }
    const m = target as MoveTarget
    return JSON.stringify({ pos: m.pos, range: (m as { range?: number }).range })
}

export const moveToCartographer = wrap(
    (
        creep: Creep,
        target: MoveToTarget,
        opts: MoveOpts = {},
    ): ReturnType<typeof moveToCartographerUnwrapped> => {
        if (Memory.cartographerDebugEnabled) {
            const start = Game.cpu.getUsed()
            const result = moveToCartographerUnwrapped(creep, target, opts)
            const cpu = Game.cpu.getUsed() - start
            if (cpu > 2) {
                const pos = creep.pos
                console.log(
                    '[cartographer]',
                    'creep:',
                    creep.name,
                    'pos:',
                    `${pos.roomName}:(${pos.x},${pos.y})`,
                    'target:',
                    formatTargetForLog(target),
                    'opts:',
                    JSON.stringify(opts),
                    'err:',
                    result,
                    'cpu:',
                    cpu.toFixed(2),
                )
            }
            return result
        }
        return moveToCartographerUnwrapped(creep, target, opts)
    },
    'travel:moveToCartographer',
)

function hasRoomPosition(target: MoveToTarget): target is _HasRoomPosition {
    return (target as _HasRoomPosition).pos !== undefined
}

function roomCallback(roomName: string, forceSafe?: true): CostMatrix | boolean {
    if (!forceSafe && !safeRoomCallback(roomName)) {
        return false
    }
    if (!Memory.rooms[roomName]) {
        return true
    }
    return MatrixCacheManager.getTravelMatrix(roomName)
}

function routeCallback(fromRoom: string, toRoom: string): number | undefined {
    if (!safeRoomCallback(toRoom)) {
        return Infinity
    }
    return undefined
}

const moveToRoomRouteCallback =
    (room: string, currentRoom: string) =>
    (fromRoom: string, toRoom: string): number | undefined => {
        if (
            toRoom === room ||
            fromRoom === room ||
            toRoom === currentRoom ||
            fromRoom === currentRoom
        ) {
            return undefined
        }
        return routeCallback(fromRoom, toRoom)
    }

const moveToRoomRoomCallback =
    (room: string, currentRoom: string) =>
    (roomName: string): CostMatrix | boolean => {
        if (roomName === room || roomName === currentRoom) {
            return roomCallback(roomName, true)
        }
        return roomCallback(roomName)
    }

/** Moves creep to center of a room, avoiding unsafe rooms */
export const moveToRoom = wrap((creep: Creep, roomName: string, opts: MoveOpts = {}): ReturnType<
    typeof moveToCartographer
> => {
    const startCPU = Game.cpu.getUsed()
    Logger.info('moveToRoom:starting', creep.name, creep.room.name, roomName, startCPU)
    if (creep.fatigue > 0) {
        return ERR_TIRED
    }

    // Inline deadlock check for performance
    // eslint-disable-next-line no-underscore-dangle
    if ((creep.memory._dlWait ?? 0) >= DEADLOCK_THRESHOLD) {
        return moveToRandomNearbyPosition(creep)
    }

    // Store position before move attempt
    const previousPos = creep.pos

    const moveToCartographerStartCPU = Game.cpu.getUsed()
    const err = moveToCartographer(
        creep,
        { pos: new RoomPosition(25, 25, roomName), range: MAX_ROOM_RANGE },
        {
            roomCallback: moveToRoomRoomCallback(roomName, creep.room.name),
            routeCallback: moveToRoomRouteCallback(roomName, creep.room.name),
            ...opts,
        },
    )
    if (err === ERR_NO_PATH) {
        Logger.error('moveToCartographer:no-path', creep.name, creep.room.name, roomName)
    }
    const moveToCartographerEndCPU = Game.cpu.getUsed()
    Logger.info(
        `moveToCartographer: ${moveToCartographerEndCPU - moveToCartographerStartCPU}`,
        creep.name,
        creep.room.name,
        roomName,
        err,
    )

    // Only track deadlock if move was attempted (not already at target)
    if (err !== OK && err !== ERR_TIRED) {
        updatePositionTracking(creep, previousPos)
    } else {
        // Reset counter on successful move
        // eslint-disable-next-line no-underscore-dangle
        creep.memory._dlWait = 0
    }

    Logger.info(
        `moveToRoom: ${Game.cpu.getUsed() - startCPU}`,
        creep.name,
        creep.room.name,
        roomName,
        err,
    )
    return err
}, 'travel:moveToRoom')

/**
 * Returns true when currentRoom and targetRoom are a base/mine pair with matching
 * entrance/exit positions and all roads built in both rooms.
 */
export function isMineTravel(currentRoom: string, targetRoom: string): boolean {
    const currentFeatures = getConstructionFeaturesV3(currentRoom)
    const targetFeatures = getConstructionFeaturesV3(targetRoom)

    if (!currentFeatures || !targetFeatures) {
        return false
    }

    let baseRoom: string
    let mineRoom: string

    if (currentFeatures.type === 'base' && targetFeatures.type === 'mine') {
        baseRoom = currentRoom
        mineRoom = targetRoom
    } else if (currentFeatures.type === 'mine' && targetFeatures.type === 'base') {
        baseRoom = targetRoom
        mineRoom = currentRoom
    } else {
        return false
    }

    const baseFeatures = getConstructionFeaturesV3(baseRoom)
    const mineFeatures = getConstructionFeaturesV3(mineRoom)

    if (
        !baseFeatures ||
        baseFeatures.type !== 'base' ||
        !mineFeatures ||
        mineFeatures.type !== 'mine'
    ) {
        return false
    }

    if (!baseFeatures.miner[mineRoom]?.exitPosition) {
        return false
    }

    if (
        !mineFeatures.minee ||
        mineFeatures.minee.miner !== baseRoom ||
        !mineFeatures.minee.entrancePosition
    ) {
        return false
    }

    const baseRoomObj = Game.rooms[baseRoom]
    const mineRoomObj = Game.rooms[mineRoom]

    if (!baseRoomObj || !mineRoomObj) {
        return false
    }

    return BuildManager.allRoadsBuilt(baseRoomObj) && BuildManager.allRoadsBuilt(mineRoomObj)
}

/** roomCallback for mine travel: uses getMineTravelMatrix for both rooms, blocks all others. */
const mineTravelRoomCallback =
    (room: string, currentRoom: string) =>
    (roomName: string): CostMatrix | boolean => {
        if (roomName === room || roomName === currentRoom) {
            return MatrixCacheManager.getMineTravelMatrix(roomName)
        }
        return false
    }

/** Moves a creep toward a room, using road-only matrices when traveling between a base and its mine. */
export const moveToRoomForMineTravel = wrap(
    (
        creep: Creep,
        roomName: string,
        opts: MoveOpts = {},
    ): ReturnType<typeof moveToCartographer> => {
        if (!isMineTravel(creep.room.name, roomName)) {
            // Mine travel not available — use terrain-only pathfinding (no roomCallback) so that
            // creep congestion near room exits doesn't produce an impassable obstacle matrix and
            // an expensive 4000-op ERR_NO_PATH search.
            if (creep.fatigue > 0) {
                return ERR_TIRED
            }
            const fallbackPos = creep.pos
            const fallbackHomeRoom = creep.room.name
            const fallbackErr = moveToCartographer(
                creep,
                { pos: new RoomPosition(25, 25, roomName), range: MAX_ROOM_RANGE },
                {
                    swampCost: 5,
                    plainCost: 2,
                    roomCallback: (room: string) =>
                        room === fallbackHomeRoom || room === roomName ? true : false,
                    routeCallback: moveToRoomRouteCallback(roomName, fallbackHomeRoom),
                    ...opts,
                },
            )
            if (fallbackErr !== OK && fallbackErr !== ERR_TIRED) {
                updatePositionTracking(creep, fallbackPos)
            } else {
                // eslint-disable-next-line no-underscore-dangle
                creep.memory._dlWait = 0
            }
            return fallbackErr
        }

        if (creep.fatigue > 0) {
            return ERR_TIRED
        }

        // eslint-disable-next-line no-underscore-dangle
        if ((creep.memory._dlWait ?? 0) >= DEADLOCK_THRESHOLD) {
            return moveToRandomNearbyPosition(creep)
        }

        const previousPos = creep.pos
        const target = { pos: new RoomPosition(25, 25, roomName), range: MAX_ROOM_RANGE }

        let err = moveToCartographer(creep, target, {
            roomCallback: mineTravelRoomCallback(roomName, creep.room.name),
            routeCallback: moveToRoomRouteCallback(roomName, creep.room.name),
            ...opts,
        })

        if (err === ERR_NO_PATH) {
            // Creep is off the mine-road network (e.g. near spawn after drop-off).
            // Use terrain-only pathfinding restricted to just the two rooms so cartographer
            // doesn't floodfill up to 64 rooms and blow the CPU budget.
            const homeRoom = creep.room.name
            err = moveToCartographer(creep, target, {
                swampCost: 5,
                plainCost: 2,
                roomCallback: (room: string) =>
                    room === homeRoom || room === roomName ? true : false,
                routeCallback: moveToRoomRouteCallback(roomName, homeRoom),
                ...opts,
            })
        }

        if (err !== OK && err !== ERR_TIRED) {
            updatePositionTracking(creep, previousPos)
        } else {
            // eslint-disable-next-line no-underscore-dangle
            creep.memory._dlWait = 0
        }

        return err
    },
    'travel:moveToRoomForMineTravel',
)

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

export const moveTo = (
    creep: Creep,
    target: MoveToTarget,
    opts: MoveOpts = {},
): ReturnType<typeof moveToCartographer> => {
    // const startCPU = Game.cpu.getUsed()
    if (creep.fatigue > 0) {
        return ERR_TIRED
    }

    // Inline deadlock check for performance
    // eslint-disable-next-line no-underscore-dangle
    if ((creep.memory._dlWait ?? 0) >= DEADLOCK_THRESHOLD) {
        return moveToRandomNearbyPosition(creep)
    }

    // Store position before move attempt
    const previousPos = creep.pos

    let err = moveToCartographer(creep, target, { roomCallback, routeCallback, ...opts })
    if (err === ERR_NO_PATH) {
        if (Array.isArray(target)) {
            target = target[0]
        }
        const pos = hasRoomPosition(target) ? target.pos : target
        if (creep.room.name === pos.roomName) {
            return moveToRoom(creep, pos.roomName, opts)
        } else {
            err = moveToCartographer(creep, target, {
                swampCost: 5,
                maxOps: 2000,
                roomCallback,
                routeCallback,
                ...opts,
            })
            // Logger.error(`moveTo: ${Game.cpu.getUsed() - startCPU}`, creep.name, target, err)
        }
    }

    // Only track deadlock if move was attempted (not already at target)
    // If err is OK or ERR_TIRED, the creep either moved or couldn't due to fatigue (not stuck)
    if (err !== OK && err !== ERR_TIRED) {
        updatePositionTracking(creep, previousPos)
    } else {
        // Reset counter on successful move
        // eslint-disable-next-line no-underscore-dangle
        creep.memory._dlWait = 0
    }

    return err
}

/** Moves within current room to the nearest of multiple targets, using per-room cost matrix */
export const moveWithinRoomToNearest = wrap(
    (creep: Creep, targets: MoveTarget[], opts: MoveOpts = {}): MoveToReturnCode => {
        // Inline deadlock check for performance
        // eslint-disable-next-line no-underscore-dangle
        if ((creep.memory._dlWait ?? 0) >= DEADLOCK_THRESHOLD) {
            return moveToRandomNearbyPosition(creep)
        }

        const previousPos = creep.pos
        const moveCount = creep.getActiveBodyparts(MOVE)
        const totalCount = creep.body.length
        const roadPreferred = moveCount / totalCount < 0.5
        const roomName = creep.room.name
        const matrix = MatrixCacheManager.getRoomMatrix(roomName, roadPreferred)
        const nRoomCallback = (rn: string): CostMatrix | boolean =>
            rn === roomName ? matrix : false
        const nRouteCallback = (_from: string, toRoom: string): number | undefined =>
            toRoom === roomName ? undefined : Infinity
        const err = moveTo(creep, targets, {
            roomCallback: nRoomCallback,
            routeCallback: nRouteCallback,
            ...opts,
        })

        if (err !== OK && err !== ERR_TIRED) {
            updatePositionTracking(creep, previousPos)
        } else {
            // eslint-disable-next-line no-underscore-dangle
            creep.memory._dlWait = 0
        }

        return err
    },
    'creep:moveWithinRoomToNearest',
)

/** Moves within current room using per-room cost matrix (respects roads based on MOVE ratio) */
export const moveWithinRoom = wrap(
    (creep: Creep, target: MoveTarget, opts: MoveOpts = {}): MoveToReturnCode => {
        // const startCPU = Game.cpu.getUsed()

        // Inline deadlock check for performance
        // eslint-disable-next-line no-underscore-dangle
        if ((creep.memory._dlWait ?? 0) >= DEADLOCK_THRESHOLD) {
            return moveToRandomNearbyPosition(creep)
        }

        // Store position before move attempt
        const previousPos = creep.pos

        const moveCount = creep.getActiveBodyparts(MOVE)
        const totalCount = creep.body.length
        const roadPreferred = moveCount / totalCount < 0.5
        const matrix = MatrixCacheManager.getRoomMatrix(creep.room.name, roadPreferred)
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
        const err = moveTo(creep, target, {
            roomCallback: nRoomCallback,
            routeCallback: nRouteCallback,
            ...opts,
        })

        // Only track deadlock if move was attempted (not already at target)
        if (err !== OK && err !== ERR_TIRED) {
            updatePositionTracking(creep, previousPos)
        } else {
            // Reset counter on successful move
            // eslint-disable-next-line no-underscore-dangle
            creep.memory._dlWait = 0
        }

        // Logger.error(`moveWithinRoom: ${Game.cpu.getUsed() - startCPU}`, creep.name, target, err)
        return err
    },
    'creep:moveWithinRoom',
)

/** Follows another creep, staying adjacent and moving in sync */
export const followCreep = wrap((creep: Creep, target: Creep): MoveToReturnCode => {
    // const startCPU = Game.cpu.getUsed()
    if (creep.fatigue > 0) {
        return ERR_TIRED
    }
    let err
    if (!creep.pos.isNearTo(target)) {
        if (creep.room.name !== target.room.name) {
            err = moveToRoom(creep, target.room.name)
            // Logger.error(`followCreep:moveToRoom: ${Game.cpu.getUsed() - startCPU}`, creep.name, target, err)
            return err
        } else {
            err = moveWithinRoom(creep, { pos: target.pos, range: 1 })
            // Logger.error(`followCreep:moveWithinRoom: ${Game.cpu.getUsed() - startCPU}`, creep.name, target, err)
            return err
        }
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
