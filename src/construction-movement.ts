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
    for (const [structureType, { moveTo, moveFrom }] of Object.entries(movement)) {
        for (const { x, y } of moveTo) {
            const obstacle = getObstacleAt(room, x, y)
            if (obstacle) {
                if (obstacle.structureType === structureType) {
                    Logger.error(
                        'construction-movement:destroyMovementStructures:moveTo:mismatch',
                        structureType,
                        room.name,
                        x,
                        y,
                    )
                } else {
                    Logger.error(
                        'construction-movement:destroyMovementStructures:moveTo:destroy',
                        room.name,
                        structureType,
                        obstacle.structureType,
                        x,
                        y,
                    )
                    obstacle.destroy()
                }
            }
        }
        for (const { x, y } of moveFrom) {
            const building = getBuildingAt(room, structureType as StructureConstant, x, y)
            if (building) {
                Logger.warning(
                    'construction-movement:destroyMovementStructures:moveFrom:destroy',
                    room.name,
                    building.structureType,
                    x,
                    y,
                )
                building.destroy()
            }
        }
    }
}
