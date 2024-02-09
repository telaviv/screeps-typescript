import * as Logger from 'utils/logger';

interface HasRoomPosition {
    pos: RoomPosition;
}

interface findClosestByRangeOpts extends PathFinderOpts {
    range?: number;
}

export function findClosestByRange(
    origin: RoomPosition,
    positions: (RoomPosition | HasRoomPosition)[],
    opts: findClosestByRangeOpts = {}): RoomPosition | HasRoomPosition | null {
    if (positions.length === 0) {
        return null;
    }

    const rooms = new Set<string>();
    for (const position of positions) {
        const pos = position instanceof RoomPosition ? position : position.pos;
        rooms.add(pos.roomName);
    }
    let closestPosition = null;
    let closestDistance = Infinity;

    for (const position of positions) {
        const pos = position instanceof RoomPosition ? position : position.pos;
        const distance = PathFinder.search(
            origin,
            { pos, range: opts.range || 0 },
            { maxRooms: 3, ...opts }
        ).path.length

        if (distance < closestDistance) {
            closestPosition = position
            closestDistance = distance
        }
    }

    return closestPosition;
}
