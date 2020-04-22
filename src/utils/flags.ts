export const STRUCTURE_COLORS = new Map<
    ColorConstant,
    BuildableStructureConstant
>([[COLOR_GREEN, STRUCTURE_RAMPART]])

export function getConstructionFlags(room: Room): Flag[] {
    return room.find(FIND_FLAGS, {
        filter: flag =>
            flag.secondaryColor === COLOR_PURPLE &&
            STRUCTURE_COLORS.has(flag.color),
    })
}
