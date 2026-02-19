import * as Logger from 'utils/logger'
import { getBuildableStructures, getBuildingAt, getObstacleAt } from 'utils/room'
import { getConstructionFeaturesV3 } from 'construction-features'
import { publish } from 'pub-sub/pub-sub'
import { SubscriptionEvent } from 'pub-sub/constants'

declare global {
    interface RoomMemory {
        clearConstructionMovement?: void
    }

    namespace NodeJS {
        interface Global {
            clearConstructionMovement(roomName: string): void
        }
    }
}

function clearConstructionMovement(roomName: string): void {
    const room = Game.rooms[roomName]
    destroyMovementStructures(room)
}

global.clearConstructionMovement = clearConstructionMovement

export function isMoving(room: Room): boolean {
    const features = getConstructionFeaturesV3(room)
    if (!features || features.type === 'none') {
        return false
    }
    return features.movement !== undefined
}

export function wipeRoom(room: Room): void {
    const features = getConstructionFeaturesV3(room)
    if (features && features.type === 'mine' && room.controller?.my) {
        return
    }
    const creeps = room.find(FIND_MY_CREEPS)
    for (const creep of creeps) {
        creep.suicide()
    }

    const structures = getBuildableStructures(room)
    for (const structure of structures) {
        structure.destroy()
    }
    room.controller?.unclaim()
}

export function destroyMovementStructures(room: Room): void {
    const features = getConstructionFeaturesV3(room)
    if (!features || features.type === 'none') {
        Logger.info(`No movement structures to destroy in ${room.name}`)
        return
    }
    const movement = features.movement

    if (!movement) {
        return
    }

    const isOwnedRoom = room.controller?.my === true

    Logger.info(
        'destroyMovementStructures:start',
        room.name,
        `Processing ${Object.keys(movement).length} structure types`,
        `Owned: ${isOwnedRoom}`,
    )

    for (const [structureType, { moveTo, moveFrom }] of Object.entries(movement)) {
        for (const { x, y } of moveTo) {
            // Ramparts and containers can be placed on top of other structures, so skip conflict check
            if (structureType === STRUCTURE_RAMPART || structureType === STRUCTURE_CONTAINER) {
                continue
            }

            const obstacle = getObstacleAt(room, x, y)
            if (obstacle) {
                if (obstacle.structureType === structureType) {
                    Logger.error(
                        'construction-movement:destroyMovementStructures:moveTo:mismatch',
                        `MISMATCH: ${structureType} at (${x},${y}) in ${room.name} is already where it should be but is in moveTo list (this should not happen!)`,
                    )
                } else {
                    if (isOwnedRoom) {
                        Logger.error(
                            'construction-movement:destroyMovementStructures:moveTo:destroy',
                            `🔨 DESTROYING ${obstacle.structureType} at (${x},${y}) in ${room.name}`,
                            `Reason: Position needed for ${structureType}`,
                            `Features want ${structureType} here, but found ${obstacle.structureType}`,
                        )
                        const result = obstacle.destroy()
                        if (result !== OK) {
                            Logger.error(
                                'construction-movement:destroyMovementStructures:moveTo:destroy-failed',
                                `Failed to destroy ${obstacle.structureType} at (${x},${y}) in ${room.name}`,
                                `Error code: ${result}`,
                            )
                        }
                    } else {
                        Logger.info(
                            'construction-movement:destroyMovementStructures:moveTo:needs-dismantling',
                            `${obstacle.structureType} at (${x},${y}) in ${room.name} blocks ${structureType}`,
                            `Will be dismantled by workers`,
                        )
                    }
                }
            }
        }
        for (let i = moveFrom.length - 1; i >= 0; i--) {
            const { x, y } = moveFrom[i]
            const building = getBuildingAt(room, structureType as StructureConstant, x, y)
            if (building) {
                if (isOwnedRoom) {
                    Logger.warning(
                        'construction-movement:destroyMovementStructures:moveFrom:destroy',
                        `🔨 DESTROYING ${building.structureType} at (${x},${y}) in ${room.name}`,
                        `Reason: This ${structureType} is in the wrong location`,
                        `Features want ${structureType} to move FROM here to a new position`,
                    )
                    const result = building.destroy()
                    if (result !== OK) {
                        Logger.error(
                            'construction-movement:destroyMovementStructures:moveFrom:destroy-failed',
                            `Failed to destroy ${building.structureType} at (${x},${y}) in ${room.name}`,
                            `Error code: ${result}`,
                            `Room owned: ${room.controller?.my}, Reserved: ${!!room.controller
                                ?.reservation}`,
                        )
                    } else {
                        Logger.info(
                            'construction-movement:destroyMovementStructures:moveFrom:destroy-success',
                            `Successfully marked ${building.structureType} at (${x},${y}) in ${room.name} for destruction`,
                        )
                    }
                } else {
                    Logger.info(
                        'construction-movement:destroyMovementStructures:moveFrom:needs-dismantling',
                        `${building.structureType} at (${x},${y}) in ${room.name} needs to be dismantled`,
                        `Will be dismantled by workers`,
                    )
                }
            } else {
                // Structure no longer exists — remove the stale entry so it doesn't
                // block dismantle task assignment indefinitely
                moveFrom.splice(i, 1)
                Logger.warning(
                    'construction-movement:destroyMovementStructures:moveFrom:not-found',
                    `No ${structureType} found at (${x},${y}) in ${room.name} — removing stale moveFrom entry`,
                )
            }
        }
    }

    if (isMovementComplete(movement)) {
        clearMovement(room, features)
    }
}

/**
 * Removes a position from movement arrays if it exists.
 * @returns Number of removals (0-2, one for moveTo and/or one for moveFrom)
 */
function removePositionFromMovement(
    movement: Record<
        string,
        { moveTo: { x: number; y: number }[]; moveFrom: { x: number; y: number }[] }
    >,
    x: number,
    y: number,
    roomName: string,
): number {
    let removals = 0

    for (const [structureType, arrays] of Object.entries(movement)) {
        // Check moveTo array
        const moveToIndex = arrays.moveTo.findIndex((pos) => pos.x === x && pos.y === y)
        if (moveToIndex !== -1) {
            arrays.moveTo.splice(moveToIndex, 1)
            removals++
            Logger.error(
                'handleMovementEventLog:removed-from-moveTo',
                roomName,
                structureType,
                `(${x},${y})`,
            )
        }

        // Check moveFrom array
        const moveFromIndex = arrays.moveFrom.findIndex((pos) => pos.x === x && pos.y === y)
        if (moveFromIndex !== -1) {
            arrays.moveFrom.splice(moveFromIndex, 1)
            removals++
            Logger.warning(
                'handleMovementEventLog:removed-from-moveFrom',
                roomName,
                structureType,
                `(${x},${y})`,
            )
        }
    }

    return removals
}

/**
 * Checks if all movement arrays are empty.
 */
function isMovementComplete(
    movement: Record<
        string,
        { moveTo: { x: number; y: number }[]; moveFrom: { x: number; y: number }[] }
    >,
): boolean {
    for (const arrays of Object.values(movement)) {
        if (arrays.moveTo.length > 0 || arrays.moveFrom.length > 0) {
            return false
        }
    }
    return true
}

/**
 * Clears movement property and publishes completion event.
 */
function clearMovement(room: Room, features: { movement?: unknown }): void {
    Logger.info(
        'handleMovementEventLog:clearing-movement',
        room.name,
        'All structures in movement diff have been processed',
    )
    features.movement = undefined
    publish(SubscriptionEvent.MOVEMENT_CLEARED, room.name)
}

/**
 * Handles EVENT_OBJECT_DESTROYED events to track structures destroyed/dismantled in movement diffs.
 * Works for both owned rooms (destroy) and unowned rooms (dismantle).
 * Removes destroyed positions from movement arrays and clears movement when complete.
 */
export function handleMovementEventLog(room: Room): void {
    const features = getConstructionFeaturesV3(room)
    if (!features || features.type === 'none' || !features.movement) {
        return
    }

    const movement = features.movement
    const eventLog = room.getEventLog()
    let totalRemovals = 0

    for (const event of eventLog) {
        if (event.event !== EVENT_OBJECT_DESTROYED) {
            continue
        }

        const eventData = event.data as EventObjectDestroyedData
        const removals = removePositionFromMovement(movement, eventData.x, eventData.y, room.name)
        totalRemovals += removals
    }

    if (totalRemovals === 0) {
        return
    }

    if (isMovementComplete(movement)) {
        clearMovement(room, features)
    } else {
        Logger.info(
            'handleMovementEventLog:progress',
            room.name,
            `Removed ${totalRemovals} position(s) from movement`,
        )
    }
}

interface EventObjectDestroyedData {
    type: string
    x: number
    y: number
}
