export function freeEnergyCapacity(creep: Creep) {
    return creep.store.getFreeCapacity(RESOURCE_ENERGY)
}

export function currentEnergyHeld(creep: Creep) {
    return creep.store.getUsedCapacity(RESOURCE_ENERGY)
}
