import { isObstacle } from 'types'
import { wrap } from './profiling'

interface HasRoomPosition {
    pos: RoomPosition
}

interface findClosestByRangeOpts extends PathFinderOpts {
    range?: number
}

declare global {
    namespace NodeJS {
        interface Global {
            getNeighbors: typeof getNeighbors
        }
    }
}
global.getNeighbors = getNeighbors

export const findClosestByRange = wrap(
    (
        origin: RoomPosition,
        positions: (RoomPosition | HasRoomPosition)[],
        opts: findClosestByRangeOpts = {},
    ): RoomPosition | HasRoomPosition | null => {
        if (positions.length === 0) {
            return null
        }

        const rooms = new Set<string>()
        for (const position of positions) {
            const pos = position instanceof RoomPosition ? position : position.pos
            rooms.add(pos.roomName)
        }
        let closestPosition = null
        let closestDistance = Infinity

        for (const position of positions) {
            const pos = position instanceof RoomPosition ? position : position.pos
            const distance = PathFinder.search(
                origin,
                { pos, range: opts.range || 0 },
                { maxRooms: 3, ...opts },
            ).path.length

            if (distance < closestDistance) {
                closestPosition = position
                closestDistance = distance
            }
        }

        return closestPosition
    },
    'room-position:findClosestByRange',
)

export function getNeighbors(pos: RoomPosition, range = 1): RoomPosition[] {
    const positions = []
    for (let x = Math.max(0, pos.x - range); x <= Math.min(49, pos.x + range); x++) {
        for (let y = Math.max(0, pos.y - range); y <= Math.min(49, pos.y + range); y++) {
            if (x === pos.x && y === pos.y) {
                continue
            }
            positions.push(new RoomPosition(x, y, pos.roomName))
        }
    }
    return positions
}

export function hasObstacle(pos: RoomPosition): boolean {
    if (Game.rooms[pos.roomName].getTerrain().get(pos.x, pos.y) === TERRAIN_MASK_WALL) {
        return true
    }
    return pos.lookFor(LOOK_STRUCTURES).some((s) => isObstacle(s.structureType))
}

export function getContainerAt(pos: RoomPosition): StructureContainer | null {
    return pos
        .lookFor(LOOK_STRUCTURES)
        .find((s) => s.structureType === STRUCTURE_CONTAINER) as StructureContainer | null
}

export function getNonObstacleNeighbors(pos: RoomPosition, range = 1): RoomPosition[] {
    return getNeighbors(pos, range).filter((p) => !hasObstacle(p))
}

export function getRandomWalkablePosition(pos: RoomPosition): RoomPosition | null {
    const positions = getNonObstacleNeighbors(pos).filter((p) => !isAtEdge(p))
    if (positions.length === 0) {
        return null
    }
    return positions[Math.floor(Math.random() * positions.length)]
}

export function isAtEdge(pos: RoomPosition): boolean {
    return pos.x === 0 || pos.x === 49 || pos.y === 0 || pos.y === 49
}
