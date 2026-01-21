import { getCalculatedLinks, getConstructionFeatures } from 'construction-features'
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

export function getVirtualControllerLink(
    roomName: string,
): StructureLink | StructureContainer | null {
    const links = getCalculatedLinks(typeof roomName === 'string' ? Game.rooms[roomName] : roomName)
    if (!links || !links.controller) {
        return null
    }
    const pos = links.controller
    const roomPosition = new RoomPosition(pos.x, pos.y, roomName)
    const structures = roomPosition.lookFor(LOOK_STRUCTURES)
    for (const structure of structures) {
        if (structure.structureType === STRUCTURE_LINK) {
            return structure as StructureLink
        } else if (structure.structureType === STRUCTURE_CONTAINER) {
            return structure as StructureContainer
        }
    }
    return null
}

/**
 * Gets all containers in a room excluding virtual storage and virtual controller link containers.
 *
 * This is important because virtual containers serve specialized roles:
 * - Virtual storage container: Temporary storage before RCL 4, managed by rebalancer
 * - Virtual controller link container: Temporary controller link before RCL 5, filled by rebalancer
 *
 * These containers should not be treated as regular containers (e.g., for rebalancer idle positioning)
 * to avoid creating circular dependencies where the rebalancer tries to collect from the same
 * container it's meant to fill.
 *
 * @param room - The room to search for containers
 * @returns Array of containers excluding virtual storage and virtual controller link containers
 */
export function getNonVirtualContainers(room: Room): StructureContainer[] {
    const virtualStorage = getVirtualStorage(room.name)
    const virtualControllerLink = getVirtualControllerLink(room.name)
    const containers = getContainers(room)
    return containers.filter((container) => {
        if (virtualStorage && container.id === virtualStorage.id) {
            return false
        }
        if (
            virtualControllerLink &&
            virtualControllerLink.structureType === STRUCTURE_CONTAINER &&
            container.id === virtualControllerLink.id
        ) {
            return false
        }
        return true
    })
}
