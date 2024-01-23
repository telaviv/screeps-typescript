export const STRUCTURE_COLORS = new Map<
    ColorConstant,
    BuildableStructureConstant
>([
    [COLOR_GREEN, STRUCTURE_RAMPART],
    [COLOR_GREY, STRUCTURE_WALL],
    [COLOR_YELLOW, STRUCTURE_STORAGE],
    [COLOR_CYAN, STRUCTURE_LINK],
    [COLOR_WHITE, STRUCTURE_EXTENSION],
    [COLOR_PURPLE, STRUCTURE_CONTAINER],
])

export function getConstructionFlags(room: Room): Flag[] {
    return room.find(FIND_FLAGS, {
        filter: (flag) =>
            flag.secondaryColor === COLOR_PURPLE &&
            STRUCTURE_COLORS.has(flag.color),
    })
}
