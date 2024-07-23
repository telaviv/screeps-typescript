import * as Logger from 'utils/logger'
import { ConstructionFeaturesV3, ConstructionMovement } from 'types'
import { getBuildingAt, getObstacleAt } from 'utils/room'

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
    return room.memory.constructionFeaturesV3?.movement !== undefined
}

export function destroyMovementStructures(room: Room): void {
    if (
        room.memory.constructionFeaturesV3 === undefined ||
        !room.memory.constructionFeaturesV3.movement
    ) {
        Logger.info(`No movement structures to destroy in ${room.name}`)
    }
    const movement = (room.memory.constructionFeaturesV3 as ConstructionFeaturesV3)
        .movement as ConstructionMovement
    for (const [structureType, { moveTo, moveFrom }] of Object.entries(movement)) {
        for (const { x, y } of moveTo) {
            const obstacle = getObstacleAt(room, x, y)
            if (obstacle) {
                obstacle.destroy()
            }
        }
        for (const { x, y } of moveFrom) {
            const building = getBuildingAt(room, structureType as StructureConstant, x, y)
            if (building) {
                building.destroy()
            }
        }
    }
}
