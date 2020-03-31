import { fromJS, hash } from 'immutable'

export default class DroppedEnergyManager {
    static cache = new Map<number, DroppedEnergyManager>()
    pos: RoomPosition
    requests: string[]

    constructor(pos: RoomPosition, requests: string[]) {
        this.pos = pos
        this.requests = requests
    }

    static create(memory: DroppedEnergyMemory): DroppedEnergyManager {
        const { x, y, roomName } = memory.pos
        const pos = new RoomPosition(x, y, roomName)
        return new DroppedEnergyManager(pos, memory.requests)
    }

    static get(memory: DroppedEnergyMemory): DroppedEnergyManager {
        const hashed = hash(fromJS(memory))
        if (DroppedEnergyManager.cache.has(hashed)) {
            return DroppedEnergyManager.cache.get(
                hashed,
            ) as DroppedEnergyManager
        }
        const droppedEnergy = DroppedEnergyManager.create(memory)
        DroppedEnergyManager.cache.set(hashed, droppedEnergy)
        return droppedEnergy
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
