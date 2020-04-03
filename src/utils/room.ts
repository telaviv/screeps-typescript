import minBy from 'lodash/minBy'

export const EXTENSION_COUNTS = [0, 0, 5, 10, 20, 30, 40, 50, 60]
export const TOWER_COUNTS = [0, 0, 0, 1, 1, 2, 2, 3, 6]

export function isAtExtensionCap(room: Room): boolean {
    if (!room.controller) {
        return true
    }
    const extensions = getExtensions(room)
    return extensions.length >= EXTENSION_COUNTS[room.controller.level]
}

export function isAtTowerCap(room: Room): boolean {
    if (!room.controller) {
        return true
    }
    const towers = getTowers(room)
    return towers.length >= TOWER_COUNTS[room.controller.level]
}

export function getExtensions(room: Room): StructureExtension[] {
    return room.find(FIND_MY_STRUCTURES, {
        filter: { structureType: STRUCTURE_EXTENSION },
    }) as StructureExtension[]
}

export function getTowers(room: Room): StructureExtension[] {
    return room.find(FIND_MY_STRUCTURES, {
        filter: { structureType: STRUCTURE_TOWER },
    }) as StructureExtension[]
}

export function getConstructionSites(room: Room): ConstructionSite[] {
    return room.find(FIND_CONSTRUCTION_SITES)
}

export function findWeakestStructure(room: Room): Structure | null {
    const roads = room.find(FIND_MY_STRUCTURES, {
        filter: { structuretype: STRUCTURE_ROAD },
    }) as Structure[]

    const weakRoads: Structure[] = roads.filter(
        road => road.hits !== road.hitsMax,
    )

    if (weakRoads.length === 0) {
        return null
    }

    return minBy(weakRoads, 'hits') as Structure
}
