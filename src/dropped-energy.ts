export default class DroppedEnergy {
    memory: DroppedEnergyMemory
    energy: number

    constructor(room: string, sourceIndex: number) {
        this.memory = Memory.rooms[room].sources[sourceIndex].dropSpot
        this.energy = 0
    }

    availableEnergy(): number {
        return this.energy
    }
}
