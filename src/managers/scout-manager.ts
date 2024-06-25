import { OwnedRoomProgress, World } from 'utils/world'

const SCOUT_VERSION = '1.0.3'

const MAX_SCOUT_DISTANCE = 3
const TIME_PER_TICK = 4.6 // seconds on shard 0
export const DistanceTTL: Record<number, number> = {
    1: (60 * 60 * 24) / TIME_PER_TICK,
    2: (60 * 60 * 24) / TIME_PER_TICK,
    3: (60 * 60 * 36) / TIME_PER_TICK,
}
export const EXPIRATION_TTL = (60 * 60 * 48) / TIME_PER_TICK

interface ScoutMemory {
    version: string
    updatedAt: number
    controllerOwner?: string
    controllerProgress?: number
    hasInvaderCore?: boolean
    enemyThatsMining?: string
}

declare global {
    interface RoomMemory {
        scout?: ScoutMemory
    }
}

class ScoutManager {
    private world: World
    private ownedRoomProgress: OwnedRoomProgress
    private scoutRoomData: Record<string, ScoutMemory>
    private gameTime: number

    constructor(
        world: World,
        ownedRoomProgress: Map<string, number>,
        scoutRoomData: Record<string, ScoutMemory>,
        gameTime: number = Game.time,
    ) {
        this.world = world
        this.ownedRoomProgress = ownedRoomProgress
        this.scoutRoomData = scoutRoomData
        this.gameTime = gameTime
    }

    static create(): ScoutManager {
        const world = new World()
        const ownedRoomProgress = new Map<string, number>()
        const scoutRoomData: Record<string, ScoutMemory> = {}
        for (const room of Object.values(Game.rooms)) {
            if (room.controller?.my) {
                ownedRoomProgress.set(room.name, room.controller.progressTotal)
            }
            if (room.memory.scout) {
                scoutRoomData[room.name] = room.memory.scout
            }
        }
        return new ScoutManager(world, ownedRoomProgress, scoutRoomData)
    }

    get ownedRooms(): string[] {
        return Array.from(this.ownedRoomProgress.keys())
    }

    findNextRoomToScout(): string | null {
        const closestRooms = this.world.getClosestRooms(this.ownedRooms, MAX_SCOUT_DISTANCE)
        for (const { roomName, distance } of closestRooms) {
            const ttl = DistanceTTL[distance] ?? 0
            if (
                !this.scoutRoomData[roomName] ||
                !Object.prototype.hasOwnProperty.call(this.scoutRoomData[roomName], 'updatedAt') ||
                this.scoutRoomData[roomName].updatedAt + ttl < this.gameTime
            ) {
                return roomName
            }
        }
        return null
    }

    findBestRoomToCreateScout(roomName: string): string | null {
        return this.world.findBestOwnedRoom(roomName, MAX_SCOUT_DISTANCE, this.ownedRoomProgress)
    }

    clearExpiredScoutData(): void {
        for (const room of Object.values(Game.rooms)) {
            const memory = room.memory.scout
            if (!memory) {
                continue
            }
            if (
                !memory.updatedAt ||
                memory.updatedAt + EXPIRATION_TTL < this.gameTime ||
                memory.version !== SCOUT_VERSION
            ) {
                delete room.memory.scout
            }
        }
    }

    run(): void {
        this.clearExpiredScoutData()
        for (const room of Object.values(Game.rooms)) {
            this.recordScoutData(room)
        }
    }

    private recordScoutData(room: Room): void {
        const scoutMemory: ScoutMemory = room.memory.scout ?? ({} as ScoutMemory)
        const controller = room.controller
        if (controller && controller.owner) {
            scoutMemory.controllerOwner = controller.owner.username
            scoutMemory.controllerProgress = controller.progressTotal
        } else {
            scoutMemory.hasInvaderCore = ScoutManager.hasInvaderCore(room)
            scoutMemory.enemyThatsMining = ScoutManager.enemyThatsMining(room)
        }
        scoutMemory.version = SCOUT_VERSION
        scoutMemory.updatedAt = this.gameTime
        room.memory.scout = scoutMemory
    }

    private static hasInvaderCore(room: Room): boolean {
        const invaderCores = room.find(FIND_STRUCTURES, {
            filter: { structureType: STRUCTURE_INVADER_CORE },
        })
        return invaderCores ? invaderCores.length > 0 : false
    }

    private static enemyThatsMining(room: Room): string | undefined {
        const sources = room.find(FIND_SOURCES)
        for (const source of sources) {
            const enemies = source.pos.findInRange(FIND_HOSTILE_CREEPS, 1)
            for (const enemy of enemies) {
                if (enemy.getActiveBodyparts(WORK) > 0) {
                    return enemy.owner.username
                }
            }
        }
        return undefined
    }
}

export { ScoutManager }
