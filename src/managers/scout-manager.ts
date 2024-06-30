import { OwnedRoomProgress, World } from 'utils/world'
import { RoomManager } from './room-manager'
import { createTravelTask } from 'tasks/travel'
import { getScouts } from 'utils/creep'
import { getSources } from 'utils/room'
import { isTravelTask } from 'tasks/travel/utils'

const SCOUT_VERSION = '1.0.4'

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
    sourceCount?: number
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
        }
        for (const [name, memory] of Object.entries(Memory.rooms)) {
            if (memory.scout) {
                scoutRoomData[name] = memory.scout
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
        for (const roomMemory of Object.values(Memory.rooms)) {
            const memory = roomMemory.scout
            if (!memory) {
                continue
            }
            if (
                !memory.updatedAt ||
                memory.updatedAt + EXPIRATION_TTL < this.gameTime ||
                memory.version !== SCOUT_VERSION
            ) {
                delete roomMemory.scout
            }
        }
    }

    run(): void {
        this.clearExpiredScoutData()
        for (const room of Object.values(Game.rooms)) {
            this.recordScoutData(room)
        }
        const roomToScout = this.findNextRoomToScout()
        if (!roomToScout) {
            return
        }
        const scouts = getScouts()
        if (
            scouts.some((scout) =>
                scout.memory.tasks.some(
                    (task) => isTravelTask(task) && task.destination === roomToScout,
                ),
            )
        ) {
            return
        }
        if (scouts.length > 0) {
            const task = createTravelTask(scouts[0].name, roomToScout)
            scouts[0].memory.tasks.push(task)
            return
        }
        if (RoomManager.getAllScoutTasks().some((task) => task.data.room === roomToScout)) {
            return
        }
        const scoutRoom = this.findBestRoomToCreateScout(roomToScout)
        if (!scoutRoom) {
            return
        }
        new RoomManager(Game.rooms[scoutRoom]).addScoutRoomTask(roomToScout)
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
        scoutMemory.sourceCount = getSources(room).length
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
