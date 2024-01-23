import { getContainerAtPosition, hasContainerAtPosition } from 'utils/room'

export default class DroppedEnergyManager {
    static cache = new Map<number, DroppedEnergyManager>()
    pos: RoomPosition
    memory: DroppedEnergyMemory

    constructor(pos: RoomPosition, memory: DroppedEnergyMemory) {
        this.pos = pos
        this.memory = memory
    }

    static create(memory: DroppedEnergyMemory): DroppedEnergyManager {
        const { x, y, roomName } = memory.pos
        const pos = new RoomPosition(x, y, roomName)
        return new DroppedEnergyManager(pos, memory)
    }

    static get(memory: DroppedEnergyMemory): DroppedEnergyManager {
        return DroppedEnergyManager.create(memory)
    }

    get room(): Room {
        return Game.rooms[this.pos.roomName]
    }

    hasContainer(): boolean {
        return hasContainerAtPosition(this.room, this.pos)
    }

    getContainer(): StructureContainer | null {
        return getContainerAtPosition(this.room, this.pos)
    }
}
