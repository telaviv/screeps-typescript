export default class DroppedEnergy {
    pos: RoomPosition
    requests: string[]

    constructor(memory: DroppedEnergyMemory) {
        this.pos = new RoomPosition(
            memory.pos.x,
            memory.pos.y,
            memory.pos.roomName,
        )
        this.requests = memory.requests
    }

    private calculateRequestAmount(): number {
        let requestAmount = 0
        for (const creepName of this.requests) {
            requestAmount += Game.creeps[creepName].store.getCapacity()
        }
        return requestAmount
    }

    private removeRequest(creepName: string) {
        this.requests.splice(this.requests.indexOf(creepName), 1)
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
        this.removeRequest(creep.name)
    }

    cleanup() {
        for (const creepName of this.requests) {
            if (!Game.creeps.hasOwnProperty(creepName)) {
                this.removeRequest(creepName)
            }
        }
    }
}
