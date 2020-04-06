import EnergyManager from 'managers/energy-manager'
import DroppedEnergyManager from 'managers/dropped-energy-manager'

export function getDropSpots(room: Room): DroppedEnergyManager[] {
    return EnergyManager.get(room).sources.map(source => source.droppedEnergy)
}
