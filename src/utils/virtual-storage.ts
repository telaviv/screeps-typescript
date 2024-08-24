import { getConstructionFeatures } from 'construction-features'
import { getContainers } from './room'

export function getVirtualStorage(roomName: string): StructureStorage | StructureContainer | null {
    const features = getConstructionFeatures(roomName)
    if (!features || !features[STRUCTURE_STORAGE] || features[STRUCTURE_STORAGE].length === 0) {
        return null
    }
    const pos = features[STRUCTURE_STORAGE][0]
    const roomPosition = new RoomPosition(pos.x, pos.y, roomName)
    const structures = roomPosition.lookFor(LOOK_STRUCTURES)
    for (const structure of structures) {
        if (structure.structureType === STRUCTURE_STORAGE) {
            return structure as StructureStorage
        } else if (structure.structureType === STRUCTURE_CONTAINER) {
            return structure as StructureContainer
        }
    }
    return null
}

export function getNonVirtualContainers(room: Room): StructureContainer[] {
    const virtualStorage = getVirtualStorage(room.name)
    if (!virtualStorage || virtualStorage.structureType === STRUCTURE_STORAGE) {
        return []
    }
    const containers = getContainers(room)
    return containers.filter((container) => container.id !== virtualStorage.id)
}
