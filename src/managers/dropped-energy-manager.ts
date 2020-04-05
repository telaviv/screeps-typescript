import includes from 'lodash/includes'
import { freeEnergyCapacity } from 'utils/creep'

export default class DroppedEnergyManager {
    static cache = new Map<number, DroppedEnergyManager>()
    pos: RoomPosition
    requests: string[]
    memory: DroppedEnergyMemory

    constructor(
        pos: RoomPosition,
        requests: string[],
        memory: DroppedEnergyMemory,
    ) {
        this.pos = pos
        this.requests = requests
        this.memory = memory
    }

    static create(memory: DroppedEnergyMemory): DroppedEnergyManager {
        const { x, y, roomName } = memory.pos
        const pos = new RoomPosition(x, y, roomName)
        return new DroppedEnergyManager(pos, memory.requests, memory)
    }

    static get(memory: DroppedEnergyMemory): DroppedEnergyManager {
        return DroppedEnergyManager.create(memory)
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
        this.persistMemory()
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
        const capacity = freeEnergyCapacity(creep)
        return capacity <= this.availableEnergy()
    }

    hasRequest(creep: Creep) {
        return includes(this.requests, creep.name)
    }

    // we need to request an amount as well. Screeps want partial pickups
    request(creep: Creep) {
        if (this.hasRequest(creep)) {
            return true
        }

        if (!this.canPickup(creep)) {
            return false
        }

        this.requests.push(creep.name)
        this.persistMemory()
        return true
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

    private persistMemory() {
        this.memory.requests = this.requests
    }
}
