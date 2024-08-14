import * as Logger from 'utils/logger'
import { getEnemyCreeps } from 'utils/room'

type RecorderTimes = typeof HOSTILE_WINDOW

type HostileRecorderMemory = {
    [key in RecorderTimes]: { time: number; parts: BodyPartConstant[][] }
}

declare global {
    interface RoomMemory {
        hostiles: HostileRecorderMemory
    }
}

const HOSTILE_WINDOW = 500

export class HostileRecorder {
    private roomName: string
    constructor(roomName: string) {
        const memory = Memory.rooms[roomName]
        if (!memory.hostiles) {
            memory.hostiles = { [HOSTILE_WINDOW]: { time: Game.time, parts: [] } }
        }
        this.roomName = roomName
    }

    get memory(): RoomMemory {
        return Memory.rooms[this.roomName]
    }

    get room(): Room | null {
        return Game.rooms[this.roomName] ?? null
    }

    get hostiles(): HostileRecorderMemory {
        return this.memory.hostiles
    }

    set hostiles(value: HostileRecorderMemory) {
        this.memory.hostiles = value
    }

    public record(): void {
        if (!this.room) {
            Logger.warning(`HostileRecorder.record: no vision for ${this.roomName}`)
            return
        }
        if (this.hostiles[HOSTILE_WINDOW].time + HOSTILE_WINDOW > Game.time) {
            this.hostiles = { [HOSTILE_WINDOW]: { time: Game.time, parts: [] } }
        }
        const hostiles = getEnemyCreeps(this.room)
        const parts = hostiles.map((creep) => creep.body.map((part) => part.type))
        const current = this.partCount(parts)
        const past = this.partCount(this.hostiles[HOSTILE_WINDOW].parts)
        if (current >= past) {
            this.hostiles[HOSTILE_WINDOW] = { time: Game.time, parts }
        }
    }

    private partCount(this: void, parts: BodyPartConstant[][]): number {
        return parts.reduce((acc, p) => acc + p.length, 0)
    }

    public dangerLevel(): number {
        if (this.hostiles[HOSTILE_WINDOW].time + HOSTILE_WINDOW < Game.time) {
            return 0
        }
        return this.hostiles[HOSTILE_WINDOW].parts.reduce(
            (acc, parts) =>
                acc + parts.filter((part) => part === ATTACK || part === RANGED_ATTACK).length,
            0,
        )
    }

    public static getDangerLevel(roomName: string): number {
        const recorder = new HostileRecorder(roomName)
        return recorder.dangerLevel()
    }
}
