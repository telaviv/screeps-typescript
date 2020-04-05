import minBy from 'lodash/minBy'
import filter from 'lodash/filter'
import DroppedEnergyManager from 'managers/dropped-energy-manager'
import EnergyManager from 'managers/energy-manager'

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

export function getTowers(room: Room): StructureTower[] {
    return room.find(FIND_MY_STRUCTURES, {
        filter: { structureType: STRUCTURE_TOWER },
    }) as StructureTower[]
}

export function getContainers(room: Room): StructureContainer[] {
    return room.find(FIND_STRUCTURES, {
        filter: { structureType: STRUCTURE_CONTAINER },
    }) as StructureContainer[]
}

export function getConstructionSites(room: Room): ConstructionSite[] {
    return room.find(FIND_CONSTRUCTION_SITES)
}

export function hasContainerAtPosition(room: Room, pos: RoomPosition) {
    return filter(room.lookForAt(LOOK_STRUCTURES, pos), {
        structureType: STRUCTURE_CONTAINER,
    })
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

export function getDropSpots(room: Room): DroppedEnergyManager[] {
    return EnergyManager.get(room).sources.map(source => source.droppedEnergy)
}
