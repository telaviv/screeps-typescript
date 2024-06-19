type Storeable = AnyStoreStructure | Tombstone | Ruin | Creep

export function getUsedCapacity(object: Storeable, resource?: ResourceConstant): number {
    const genericStore = object.store as GenericStore
    return genericStore.getUsedCapacity(resource) || 0
}

export function getFreeCapacity(object: Storeable, resource?: ResourceConstant): number {
    const genericStore = object.store as GenericStore
    return genericStore.getFreeCapacity(resource) || 0
}
