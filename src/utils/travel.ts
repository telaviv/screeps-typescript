import {
    MoveOpts,
    MoveTarget,
    moveTo as moveToCartographerUnwrapped,
    generatePath as generatePathCartographer,
} from 'screeps-cartographer'

import { ROAD_STUCK_THRESHOLD } from '../constants'
import { MinePathEntry, getConstructionFeaturesV3, getMinePaths } from 'construction-features'
import { MatrixCacheManager } from 'matrix-cache'
import BuildManager from 'managers/build-manager'
import { RoadGraph } from 'types'
import { MoveToReturnCode } from './creep'
import { safeRoomCallback } from './world'
import { wrap } from './profiling'
import { trackPosition } from './deadlock'
import * as Logger from './logger'
import { followMinePath, reverseMinePath } from './mine-travel'
import { astar } from './road-graph'

const astarProfiled = wrap(astar, 'travel:astar')

declare global {
    interface Memory {
        cartographerDebugEnabled?: boolean
        astarDebugEnabled?: boolean
    }
}

const MAX_ROOM_RANGE = 20
const ASTAR_DEBUG_CPU_THRESHOLD = 0

type MoveToTarget = _HasRoomPosition | RoomPosition | MoveTarget | RoomPosition[] | MoveTarget[]

function formatTargetForLog(target: MoveToTarget): string {
    if (Array.isArray(target)) {
        return `[${target.map((t) => formatTargetForLog(t)).join(',')}]`
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

/**
 * Returns a minePath spanning currentRoom and targetRoom, or null if none exists.
 * Stored paths go base→mine; reverses the path when travelling mine→base.
 */
function findMinePathForRooms(currentRoom: string, targetRoom: string): MinePathEntry[] | null {
    const currentFeatures = getConstructionFeaturesV3(currentRoom)
    const targetFeatures = getConstructionFeaturesV3(targetRoom)
    const mineRoom =
        targetFeatures?.type === 'mine'
            ? targetRoom
            : currentFeatures?.type === 'mine'
            ? currentRoom
            : null
    if (!mineRoom) return null

    const minePaths = getMinePaths(mineRoom)
    if (!minePaths) return null

    for (const rawPath of Object.values(minePaths)) {
        if (
            rawPath.some((e) => e.roomName === currentRoom) &&
            rawPath.some((e) => e.roomName === targetRoom)
        ) {
            return mineRoom === targetRoom ? rawPath : reverseMinePath(rawPath)
        }
    }
    return null
}

/** Moves creep to center of a room, avoiding unsafe rooms */
export const moveToRoom = wrap(
    (
        creep: Creep,
        roomName: string,
        opts: MoveOpts & { skipMinePath?: boolean } = {},
    ): ReturnType<typeof moveToCartographer> => {
        const { skipMinePath, ...cartographerOpts } = opts
        const startCPU = Game.cpu.getUsed()
        Logger.info('moveToRoom:starting', creep.name, creep.room.name, roomName, startCPU)
        if (creep.fatigue > 0) {
            return ERR_TIRED
        }

        trackPosition(creep)

        if (!skipMinePath) {
            const minePath = findMinePathForRooms(creep.room.name, roomName)
            if (minePath) {
                // eslint-disable-next-line no-underscore-dangle
                const isDeadlocked = (creep.memory._dlWait ?? 0) > 1
                if (!isDeadlocked) {
                    const result = followMinePath(creep, minePath, 'moveToRoom')
                    if (result !== ERR_NOT_FOUND) {
                        return result as CreepMoveReturnCode
                    }
                    return moveTowardMinePath(creep, minePath) as CreepMoveReturnCode
                }
                return moveTowardMinePathAvoidingStuck(creep, minePath) as CreepMoveReturnCode
            }
        }

        const moveToCartographerStartCPU = Game.cpu.getUsed()
        const err = moveToCartographer(
            creep,
            { pos: new RoomPosition(25, 25, roomName), range: MAX_ROOM_RANGE },
            {
                roomCallback: moveToRoomRoomCallback(roomName, creep.room.name),
                routeCallback: moveToRoomRouteCallback(roomName, creep.room.name),
                ...cartographerOpts,
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

        Logger.info(
            `moveToRoom: ${Game.cpu.getUsed() - startCPU}`,
            creep.name,
            creep.room.name,
            roomName,
            err,
        )
        return err
    },
    'travel:moveToRoom',
)

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
            trackPosition(creep)
            const homeRoom = creep.room.name
            return moveToCartographer(
                creep,
                { pos: new RoomPosition(25, 25, roomName), range: MAX_ROOM_RANGE },
                {
                    swampCost: 5,
                    plainCost: 2,
                    roomCallback: (room: string) =>
                        room === homeRoom || room === roomName ? true : false,
                    routeCallback: moveToRoomRouteCallback(roomName, homeRoom),
                    ...opts,
                },
            )
        }

        if (creep.fatigue > 0) {
            return ERR_TIRED
        }

        trackPosition(creep)

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

    let err = moveToCartographer(creep, target, { roomCallback, routeCallback, ...opts })
    if (err === ERR_NO_PATH) {
        if (Array.isArray(target)) {
            target = target[0]
        }
        const pos = hasRoomPosition(target) ? target.pos : target
        if (creep.room.name === pos.roomName) {
            // Terrain-only retry scoped to the current room.
            // Calling moveToRoom here would re-enter mine-path logic and cause infinite recursion.
            return moveToCartographer(creep, target, {
                swampCost: 5,
                plainCost: 2,
                roomCallback: (r) => (r === creep.room.name ? true : false),
                routeCallback: (_from, toRoom) =>
                    toRoom === creep.room.name ? undefined : Infinity,
            })
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

    return err
}

function moveAlongRoadPath(
    creep: Creep,
    path: string[],
    graph: RoadGraph,
    roomName: string,
): MoveToReturnCode {
    const firstNode = graph.nodes[path[0]]
    const atFirst = creep.pos.x === firstNode.x && creep.pos.y === firstNode.y
    if (atFirst && path.length === 1) return OK
    const nextKey = atFirst ? path[1] : path[0]
    const next = graph.nodes[nextKey]
    const dir = creep.pos.getDirectionTo(new RoomPosition(next.x, next.y, roomName))
    return creep.move(dir) as MoveToReturnCode
}

/**
 * Moves a creep toward the nearest step of a mine path in its current room.
 * Uses the road graph A* when the creep is already on a road node; otherwise
 * falls back to cartographer via moveWithinRoom.
 */
export function moveTowardMinePath(creep: Creep, path: MinePathEntry[]): MoveToReturnCode {
    const roomName = creep.room.name
    const stepsInRoom = path.filter((e) => e.roomName === roomName)
    if (stepsInRoom.length === 0) return ERR_NOT_FOUND as MoveToReturnCode

    const graph = Memory.rooms[roomName]?.roadGraph
    const startKey = `${creep.pos.x},${creep.pos.y}`

    if (
        graph &&
        Game.rooms[roomName] &&
        BuildManager.allRoadsBuilt(Game.rooms[roomName]) &&
        graph.nodes[startKey]
    ) {
        const targetKeys = new Set(
            stepsInRoom.filter((e) => graph.nodes[`${e.x},${e.y}`]).map((e) => `${e.x},${e.y}`),
        )
        if (targetKeys.size > 0) {
            const astarPath = astarProfiled(graph, startKey, targetKeys)
            if (astarPath) {
                return moveAlongRoadPath(creep, astarPath, graph, roomName)
            }
        }
    }

    // Not on road graph or no A* path — use cartographer
    const firstInRoom = stepsInRoom[0]
    return moveWithinRoom(creep, {
        pos: new RoomPosition(firstInRoom.x, firstInRoom.y, roomName),
        range: 0,
    })
}

/**
 * Like moveTowardMinePath, but treats any creep with _dlWait > 1 (other than self) as a
 * blocked road node so the A* routes around them.
 */
function moveTowardMinePathAvoidingStuck(creep: Creep, path: MinePathEntry[]): MoveToReturnCode {
    const roomName = creep.room.name
    const stepsInRoom = path.filter((e) => e.roomName === roomName)
    if (stepsInRoom.length === 0) return ERR_NOT_FOUND as MoveToReturnCode

    const graph = Memory.rooms[roomName]?.roadGraph
    const startKey = `${creep.pos.x},${creep.pos.y}`

    if (
        graph &&
        Game.rooms[roomName] &&
        BuildManager.allRoadsBuilt(Game.rooms[roomName]) &&
        graph.nodes[startKey]
    ) {
        const targetKeys = new Set(
            stepsInRoom.filter((e) => graph.nodes[`${e.x},${e.y}`]).map((e) => `${e.x},${e.y}`),
        )
        if (targetKeys.size > 0) {
            const blockedNodes = new Set<string>()
            for (const c of Object.values(Game.creeps)) {
                // eslint-disable-next-line no-underscore-dangle
                if (
                    c.name !== creep.name &&
                    (c.memory._dlWait ?? 0) > 1 &&
                    c.room.name === roomName
                ) {
                    const key = `${c.pos.x},${c.pos.y}`
                    if (graph.nodes[key] && !targetKeys.has(key)) {
                        blockedNodes.add(key)
                    }
                }
            }
            const astarPath = astarProfiled(graph, startKey, targetKeys, blockedNodes)
            if (astarPath) {
                return moveAlongRoadPath(creep, astarPath, graph, roomName)
            }
        }
    }

    // Not on road graph or no A* path — use cartographer
    const firstInRoom = stepsInRoom[0]
    return moveWithinRoom(creep, {
        pos: new RoomPosition(firstInRoom.x, firstInRoom.y, roomName),
        range: 0,
    })
}

/** Moves within current room to the nearest of multiple targets, using per-room cost matrix */
export const moveWithinRoomToNearest = wrap(
    (creep: Creep, targets: MoveTarget[], opts: MoveOpts = {}): MoveToReturnCode => {
        trackPosition(creep)

        const roomName = creep.room.name
        const graph = Memory.rooms[roomName]?.roadGraph
        if (graph && BuildManager.allRoadsBuilt(creep.room)) {
            const startKey = `${creep.pos.x},${creep.pos.y}`
            if (graph.nodes[startKey]) {
                let bestPath: string[] | null = null
                const astarStart = Memory.astarDebugEnabled ? Game.cpu.getUsed() : 0
                for (const t of targets) {
                    const tRange = (t as { range?: number }).range ?? 1
                    if (tRange !== 1) continue
                    const obstacleKey = `${t.pos.x},${t.pos.y}`
                    const obstacleEntry = graph.obstacles[obstacleKey]
                    if (!obstacleEntry) continue
                    const path = astarProfiled(graph, startKey, new Set(obstacleEntry.roads))
                    if (path && (!bestPath || path.length < bestPath.length)) {
                        bestPath = path
                    }
                }
                if (Memory.astarDebugEnabled) {
                    const astarCpu = Game.cpu.getUsed() - astarStart
                    if (astarCpu > ASTAR_DEBUG_CPU_THRESHOLD) {
                        console.log(
                            '[astar:moveWithinRoomToNearest]',
                            'creep:',
                            creep.name,
                            'pos:',
                            `${roomName}:(${creep.pos.x},${creep.pos.y})`,
                            'targets:',
                            targets.length,
                            'bestPathLen:',
                            bestPath ? bestPath.length : 'null',
                            'cpu:',
                            astarCpu.toFixed(4),
                        )
                    }
                }
                if (bestPath) {
                    return moveAlongRoadPath(creep, bestPath, graph, roomName)
                }
            }
        }

        const moveCount = creep.getActiveBodyparts(MOVE)
        const totalCount = creep.body.length
        const roadPreferred = moveCount / totalCount < 0.5
        const matrix = MatrixCacheManager.getRoomMatrix(roomName, roadPreferred)
        const nRoomCallback = (rn: string): CostMatrix | boolean =>
            rn === roomName ? matrix : false
        const nRouteCallback = (_from: string, toRoom: string): number | undefined =>
            toRoom === roomName ? undefined : Infinity
        return moveTo(creep, targets, {
            roomCallback: nRoomCallback,
            routeCallback: nRouteCallback,
            ...opts,
        })
    },
    'creep:moveWithinRoomToNearest',
)

/** Moves within current room using per-room cost matrix (respects roads based on MOVE ratio) */
export const moveWithinRoom = wrap(
    (creep: Creep, target: MoveTarget, opts: MoveOpts = {}): MoveToReturnCode => {
        // const startCPU = Game.cpu.getUsed()

        trackPosition(creep)

        const range = target.range ?? 1
        if (range === 1) {
            const roomName = creep.room.name
            const graph = Memory.rooms[roomName]?.roadGraph
            if (graph && Game.rooms[roomName] && BuildManager.allRoadsBuilt(Game.rooms[roomName])) {
                const startKey = `${creep.pos.x},${creep.pos.y}`
                if (graph.nodes[startKey]) {
                    const obstacleKey = `${target.pos.x},${target.pos.y}`
                    const obstacleEntry = graph.obstacles[obstacleKey]
                    if (obstacleEntry) {
                        const astarStart = Memory.astarDebugEnabled ? Game.cpu.getUsed() : 0
                        const path = astarProfiled(graph, startKey, new Set(obstacleEntry.roads))
                        if (Memory.astarDebugEnabled) {
                            const astarCpu = Game.cpu.getUsed() - astarStart
                            if (astarCpu > ASTAR_DEBUG_CPU_THRESHOLD) {
                                console.log(
                                    '[astar:moveWithinRoom]',
                                    'creep:',
                                    creep.name,
                                    'pos:',
                                    `${roomName}:(${creep.pos.x},${creep.pos.y})`,
                                    'target:',
                                    `${roomName}:(${target.pos.x},${target.pos.y})`,
                                    'pathLen:',
                                    path ? path.length : 'null',
                                    'cpu:',
                                    astarCpu.toFixed(4),
                                )
                            }
                        }
                        if (path) {
                            // eslint-disable-next-line no-underscore-dangle
                            if ((creep.memory._dlWait ?? 0) >= ROAD_STUCK_THRESHOLD) {
                                // Stuck on road graph — go directly to target via cartographer
                                return moveToCartographer(creep, target)
                                // // Stuck on road graph — pass up to 5 lookahead waypoints to
                                // // cartographer so it can route around whatever is blocking
                                // const lookahead = path.slice(1, 6)
                                // if (lookahead.length === 0) {
                                //     return moveAlongRoadPath(creep, path, graph, roomName)
                                // }
                                // const waypoints: MoveTarget[] = lookahead.map((key) => ({
                                //     pos: new RoomPosition(
                                //         graph.nodes[key].x,
                                //         graph.nodes[key].y,
                                //         roomName,
                                //     ),
                                //     range: 0,
                                // }))
                                // return moveToCartographer(creep, waypoints)
                            }
                            return moveAlongRoadPath(creep, path, graph, roomName)
                        }
                    }
                }
            }
        }

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
        // When stuck, force a fresh path calculation to route around blockers
        // eslint-disable-next-line no-underscore-dangle
        const reusePath = (creep.memory._dlWait ?? 0) >= ROAD_STUCK_THRESHOLD ? 0 : 10
        // Call moveToCartographer directly instead of moveTo to avoid re-entering mine-path
        // logic (moveTo's same-room ERR_NO_PATH branch can recurse back through moveToRoom).
        return moveToCartographer(creep, target, {
            reusePath,
            roomCallback: nRoomCallback,
            routeCallback: nRouteCallback,
            ...opts,
        }) as MoveToReturnCode
        // Logger.error(`moveWithinRoom: ${Game.cpu.getUsed() - startCPU}`, creep.name, target, err)
    },
    'creep:moveWithinRoom',
)

/**
 * Moves a creep to a parking spot near the target, preferring non-road tiles.
 * Clones the room matrix and marks all roads within target.range as impassable so the
 * pathfinder steers the creep onto plain/swamp tiles instead of blocking traffic.
 * Falls back to the unmodified matrix when no accessible non-road tile exists in range.
 */
export const moveToParkingSpot = wrap(
    (creep: Creep, target: MoveTarget, opts: MoveOpts = {}): MoveToReturnCode => {
        if (creep.fatigue > 0) return ERR_TIRED
        trackPosition(creep)

        const roomName = creep.room.name
        const range = target.range ?? 1
        const roadPreferred = creep.getActiveBodyparts(MOVE) / creep.body.length < 0.5

        const baseMatrix = MatrixCacheManager.getRoomMatrix(roomName, roadPreferred)
        const matrix = baseMatrix.clone()

        const roads = target.pos.findInRange(FIND_STRUCTURES, range, {
            filter: (s: Structure) => s.structureType === STRUCTURE_ROAD,
        })
        for (const road of roads) {
            matrix.set(road.pos.x, road.pos.y, 255)
        }

        const terrain = new Room.Terrain(roomName)
        let hasAccessible = false
        for (let dx = -range; dx <= range && !hasAccessible; dx++) {
            for (let dy = -range; dy <= range; dy++) {
                const x = target.pos.x + dx
                const y = target.pos.y + dy
                if (x < 1 || x > 48 || y < 1 || y > 48) continue
                if (terrain.get(x, y) === TERRAIN_MASK_WALL) continue
                if (matrix.get(x, y) < 255) {
                    hasAccessible = true
                    break
                }
            }
        }

        const activeMatrix = hasAccessible ? matrix : baseMatrix
        const nRoomCallback = (rn: string): CostMatrix | boolean =>
            rn === roomName ? activeMatrix : false
        const nRouteCallback = (_from: string, toRoom: string): number | undefined =>
            toRoom === roomName ? undefined : Infinity

        return moveTo(creep, target, {
            roomCallback: nRoomCallback,
            routeCallback: nRouteCallback,
            ...opts,
        })
    },
    'travel:moveToParkingSpot',
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
