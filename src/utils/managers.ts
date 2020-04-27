import EnergyManager from 'managers/energy-manager'
import DroppedEnergyManager from 'managers/dropped-energy-manager'

export function getDropSpots(room: Room): DroppedEnergyManager[] {
    const em = EnergyManager.get(room)
    if (!em.sources) {
        return []
    }
    return em.sources.map(source => source.droppedEnergy)
}
