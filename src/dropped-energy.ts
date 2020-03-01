export default class DroppedEnergy {
    pos: RoomPosition
    requests: string[]

    constructor(room: string, sourceIndex: number) {
        const memory = Memory.rooms[room].sources[sourceIndex].dropSpot
        this.pos = memory.pos
        this.requests = memory.requests
    }

    private calculateRequestAmount(): number {
        let requestAmount = 0
        for (const creepName of this.requests) {
            requestAmount += Game.creeps[creepName].store.getCapacity()
        }
        return requestAmount
    }

    availableEnergy(): number {
        const room = Game.rooms[this.pos.roomName]
        const resources = room.lookForAt(LOOK_ENERGY, this.pos)
        if (resources.length === 0) {
            return 0
        }
        const currentEnergy = resources[0].amount
        return currentEnergy - this.calculateRequestAmount()
    }

    canPickup(creep: Creep) {
        const capacity = creep.store.getCapacity()
        return capacity <= this.availableEnergy()
    }

    request(creep: Creep) {
        if (!this.canPickup(creep)) {
            return
        }

        this.requests.push(creep.name)
    }

    completeRequest(creep: Creep) {
        this.requests.splice(this.requests.indexOf(creep.name), 1)
    }
}
