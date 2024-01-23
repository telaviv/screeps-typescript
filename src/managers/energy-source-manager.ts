import { WithdrawObject } from 'tasks/withdraw/object'
import { PickupTarget } from 'tasks/pickup/target'

export default class EnergySourceManager {
    room: Room

    constructor(room: Room) {
        this.room = room
    }

    /**
     * Calculates the total amount of available energy from pickups and withdrawals in the room.
     * @returns The total amount of available energy.
     */
    public energyAvailable() {
        const resourceSum = (acc: number, val: WithdrawObject | PickupTarget) =>
            acc + val.resourcesAvailable(RESOURCE_ENERGY)

        const pickups = PickupTarget.findInRoom(this.room, RESOURCE_ENERGY)
        const withdrawals = WithdrawObject.getTargetsInRoom(this.room)
        const pickupEnergy = pickups.reduce(resourceSum, 0)
        const withdrawEnergy = withdrawals.reduce(resourceSum, 0)
        return pickupEnergy + withdrawEnergy
    }

    /**
     * Retrieves the available energy in the specified room.
     *
     * @param room - The room to get the energy from.
     * @returns The amount of available energy in the room.
     */
    static getEnergyAvailable(room: Room) {
        return new EnergySourceManager(room).energyAvailable();
    }
}
