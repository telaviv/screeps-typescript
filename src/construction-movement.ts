import * as Logger from 'utils/logger'
import { getBuildableStructures, getBuildingAt, getObstacleAt } from 'utils/room'
import { getConstructionFeaturesV3 } from 'construction-features'

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

    Logger.info(
        'destroyMovementStructures:start',
        room.name,
        `Processing ${Object.keys(movement).length} structure types`,
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
                }
            }
        }
        for (const { x, y } of moveFrom) {
            const building = getBuildingAt(room, structureType as StructureConstant, x, y)
            if (building) {
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
                Logger.warning(
                    'construction-movement:destroyMovementStructures:moveFrom:not-found',
                    `No ${structureType} found at (${x},${y}) in ${room.name} to destroy`,
                )
            }
        }
    }
}
