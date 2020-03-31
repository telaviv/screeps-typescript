export const EXTENSION_COUNTS = [0, 0, 5, 10, 20, 30, 40, 50, 60]

export function isAtExtensionCap(room: Room): boolean {
    if (!room.controller) {
        return true
    }
    const extensions = getExtensions(room)
    return extensions.length >= EXTENSION_COUNTS[room.controller.level]
}

export function getExtensions(room: Room): StructureExtension[] {
    return room.find(FIND_STRUCTURES, {
        filter: { structureType: STRUCTURE_EXTENSION },
    }) as StructureExtension[]
}

export function getConstructionSites(room: Room): ConstructionSite[] {
    return room.find(FIND_CONSTRUCTION_SITES)
}
