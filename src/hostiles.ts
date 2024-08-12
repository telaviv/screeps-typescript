import { getEnemyCreeps } from 'utils/room'

interface HostileRecorderMemory {
    [window: number]: { time: number; parts: BodyPartConstant[][] }
}

declare global {
    interface RoomMemory {
        hostiles: HostileRecorderMemory
    }
}

const HOSTILE_WINDOW = 500

export class HostileRecorder {
    private room: Room
    constructor(room: Room) {
        if (!room.memory.hostiles) {
            room.memory.hostiles = { [HOSTILE_WINDOW]: { time: Game.time, parts: [] } }
        }
        this.room = room
    }

    get hostiles(): HostileRecorderMemory {
        return this.room.memory.hostiles
    }

    set hostiles(value: HostileRecorderMemory) {
        this.room.memory.hostiles = value
    }

    public record(): void {
        if (this.hostiles[HOSTILE_WINDOW].time + HOSTILE_WINDOW > Game.time) {
            this.hostiles = { [HOSTILE_WINDOW]: { time: Game.time, parts: [] } }
        }
        const hostiles = getEnemyCreeps(this.room)
        const parts = hostiles.map((creep) => creep.body.map((part) => part.type))
        const current = this.partCount(parts)
        const past = this.partCount(this.hostiles[HOSTILE_WINDOW].parts)
        if (current > past) {
            this.hostiles[Game.time] = { time: Game.time, parts }
        }
    }

    private partCount(this: void, parts: BodyPartConstant[][]): number {
        return parts.reduce((acc, p) => acc + p.length, 0)
    }

    public dangerLevel(): number {
        return this.hostiles[HOSTILE_WINDOW].parts.reduce(
            (acc, parts) =>
                acc + parts.filter((part) => part === ATTACK || part === RANGED_ATTACK).length,
            0,
        )
    }
}
