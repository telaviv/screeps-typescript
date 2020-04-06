import includes from 'lodash/includes'
import { freeEnergyCapacity } from 'utils/creep'
import { hasContainerAtPosition, getContainerAtPosition } from 'utils/room'

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

    get room(): Room {
        return Game.rooms[this.pos.roomName]
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
        const currentEnergy = this.calculateStoredEnergy()
        return currentEnergy - this.calculateRequestAmount()
    }

    private calculateStoredEnergy(): number {
        if (this.hasContainer()) {
            const container = this.getContainer() as StructureContainer
            const energy = container.store.getUsedCapacity(RESOURCE_ENERGY)
            console.log('returning container energy', energy)
            return energy
        }
        const resources = this.room.lookForAt(LOOK_ENERGY, this.pos)
        if (resources.length === 0) {
            return 0
        }
        return resources[0].amount
    }

    hasContainer(): boolean {
        return hasContainerAtPosition(this.room, this.pos)
    }

    getContainer(): StructureContainer | null {
        return getContainerAtPosition(this.room, this.pos)
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
