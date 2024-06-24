import { OwnedRoomProgress, World } from 'utils/world'

const MAX_SCOUT_DISTANCE = 3
const TIME_PER_TICK = 4.6 // seconds on shard 0
const DistanceTTL: Record<number, number> = {
    1: (60 * 60 * 24) / TIME_PER_TICK,
    2: (60 * 60 * 24) / TIME_PER_TICK,
    3: (60 * 60 * 36) / TIME_PER_TICK,
}
export const EXPIRATION_TTL = (60 * 60 * 48) / TIME_PER_TICK

interface ScoutMemory {
    updatedAt: number
    controllerOwner?: string
    controllerProgress?: number
    hasInvaderCore?: boolean
    enemyThatsMining?: string
}

declare global {
    interface RoomMemory {
        scout: ScoutMemory
    }
}

class ScoutManager {
    private world: World;
    private ownedRoomProgress: OwnedRoomProgress;
    private scoutRoomData: Record<string, ScoutMemory>;

    constructor(world: World, ownedRoomProgress: Map<string, number>, scoutRoomData: Record<string, ScoutMemory>) {
        this.world = world;
        this.ownedRoomProgress = ownedRoomProgress;
        this.scoutRoomData = scoutRoomData;
    }

    get ownedRooms(): string[] {
        return Array.from(this.ownedRoomProgress.keys());
    }

    findNextRoomToScout(): string | null {
        const closestRooms = this.world.getClosestRooms(this.ownedRooms, MAX_SCOUT_DISTANCE);
        for (const { roomName, distance } of closestRooms) {
            const ttl = DistanceTTL[distance] ?? 0;
            if (!this.scoutRoomData[roomName] ||
                !this.scoutRoomData[roomName].updatedAt ||
                this.scoutRoomData[roomName].updatedAt + ttl < Game.time) {
                return roomName;
            }

        }
        return null;
    }

    findBestRoomToCreateScout(roomName: string): string | null {
        return this.world.findBestOwnedRoom(roomName, MAX_SCOUT_DISTANCE, this.ownedRoomProgress);
    }
}

export { ScoutManager };
