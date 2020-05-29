import { WithdrawObject } from 'tasks/withdraw/object'
import { PickupTarget } from 'tasks/pickup/target'

export default class EnergySourceManager {
    room: Room

    constructor(room: Room) {
        this.room = room
    }

    energyAvailable() {
        const resourceSum = (acc: number, val: WithdrawObject | PickupTarget) =>
            acc + val.resourcesAvailable(RESOURCE_ENERGY)

        const pickups = PickupTarget.findInRoom(this.room, RESOURCE_ENERGY)
        const withdrawals = WithdrawObject.getTargetsInRoom(this.room)
        const pickupEnergy = pickups.reduce(resourceSum, 0)
        const withdrawEnergy = withdrawals.reduce(resourceSum, 0)
        return pickupEnergy + withdrawEnergy
    }
}
