import * as Logger from 'utils/logger'
import { getEnemyCreeps } from 'utils/room'

type RecorderTimes = typeof HOSTILE_WINDOW

/** Memory structure tracking hostile creep body parts over time windows */
type HostileRecorderMemory = {
    [key in RecorderTimes]: { time: number; parts: BodyPartConstant[][] }
}

declare global {
    interface RoomMemory {
        hostiles: HostileRecorderMemory
    }
}

/** Number of ticks to track hostile activity */
const HOSTILE_WINDOW = 1000

/**
 * Records and tracks hostile creep activity in a room over time.
 * Used to assess danger levels for defensive spawning decisions.
 */
export class HostileRecorder {
    private roomName: string

    /**
     * @param roomName - Name of the room to track hostiles for
     */
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

    /** Records current hostile creeps, keeping the most dangerous configuration seen */
    public record(): void {
        if (!this.room) {
            Logger.warning(`HostileRecorder.record: no vision for ${this.roomName}`)
            return
        }
        if (
            !this.hostiles[HOSTILE_WINDOW] ||
            this.hostiles[HOSTILE_WINDOW].time + HOSTILE_WINDOW > Game.time
        ) {
            this.hostiles = { [HOSTILE_WINDOW]: { time: Game.time, parts: [] } }
        }
        const hostiles = getEnemyCreeps(this.room)
        const parts = hostiles.map((creep) => creep.body.map((part) => part.type))
        const current = this.dangerFromParts(parts)
        const past = this.dangerFromParts(this.hostiles[HOSTILE_WINDOW].parts)
        if (current >= past) {
            this.hostiles[HOSTILE_WINDOW] = { time: Game.time, parts }
        }
    }

    /**
     * Calculates danger score from body parts (counts ATTACK and RANGED_ATTACK).
     * @param parts - Array of body part arrays from hostile creeps
     */
    private dangerFromParts(parts: BodyPartConstant[][]): number {
        return parts.reduce(
            (acc, p) => acc + p.filter((part) => part === ATTACK || part === RANGED_ATTACK).length,
            0,
        )
    }

    /** Returns current danger level including ATTACK, RANGED_ATTACK, and HEAL parts */
    public dangerLevel(): number {
        if (this.hostiles[HOSTILE_WINDOW].time + HOSTILE_WINDOW < Game.time) {
            return 0
        }
        return this.hostiles[HOSTILE_WINDOW].parts.reduce(
            (acc, parts) =>
                acc +
                parts.filter((part) => part === ATTACK || part === RANGED_ATTACK || part === HEAL)
                    .length,
            0,
        )
    }

    /**
     * Static helper to get danger level for a room.
     * @param roomName - Name of the room to check
     */
    public static getDangerLevel(roomName: string): number {
        const recorder = new HostileRecorder(roomName)
        return recorder.dangerLevel()
    }
}
