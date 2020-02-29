export default class DroppedEnergy {
    memory: DroppedEnergyMemory

    constructor(room: string, sourceIndex: number) {
        this.memory = Memory.rooms[room].sources[sourceIndex].dropSpot
    }

    availableEnergy(): number {
        const pos = this.memory.pos
        const room = Game.rooms[pos.roomName]
        const resources = room.lookForAt(LOOK_ENERGY, pos)
        if (resources.length === 0) {
            return 0
        }

        return resources[0].amount
    }
}
