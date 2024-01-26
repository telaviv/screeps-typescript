import { getContainerAtPosition, hasContainerAtPosition } from 'utils/room'
import { DroppedEnergyMemory } from './types'

export default class DroppedEnergyManager {
    static cache = new Map<number, DroppedEnergyManager>()
    pos: RoomPosition
    memory: DroppedEnergyMemory

    public constructor(pos: RoomPosition, memory: DroppedEnergyMemory) {
        this.pos = pos
        this.memory = memory
    }

    public static createFromSourceId(id: Id<Source>): DroppedEnergyManager {
        const source = Game.getObjectById(id)!
        return DroppedEnergyManager.get(source.room.memory.sources.find((s) => s.id === id)!.dropSpot)
    }

    public static create(memory: DroppedEnergyMemory): DroppedEnergyManager {
        const { x, y, roomName } = memory.pos
        const pos = new RoomPosition(x, y, roomName)
        return new DroppedEnergyManager(pos, memory)
    }

    public static get(memory: DroppedEnergyMemory): DroppedEnergyManager {
        return DroppedEnergyManager.create(memory)
    }

    public get room(): Room {
        return Game.rooms[this.pos.roomName]
    }

    public hasContainer(): boolean {
        return hasContainerAtPosition(this.room, this.pos)
    }

    public getContainer(): StructureContainer | null {
        return getContainerAtPosition(this.room, this.pos)
    }
}
