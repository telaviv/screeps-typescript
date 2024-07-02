import { getLinks } from 'utils/room'

export default class LinkManager {
    public static cache = new Map<string, LinkManager>()

    public readonly storageLink: StructureLink
    public readonly containerLink: StructureLink
    public readonly sourceLinks: StructureLink[]

    public constructor(
        storageLink: StructureLink,
        containerLink: StructureLink,
        sourceLinks: StructureLink[],
    ) {
        this.storageLink = storageLink
        this.containerLink = containerLink
        this.sourceLinks = sourceLinks
    }

    public static canCreateLinkManager(room: Room): boolean {
        return getLinks(room).length === 4 // 1 storage link, 1 container link, 2 source links for now
    }

    /**
    public static createFromRoom(room: Room): LinkManager {
        const stationaryPoints = room.memory.stationaryPoints
        if (!stationaryPoints) throw new Error(`No stationary points found in room ${room.name}`)
        const storageStationaryPos = new RoomPosition(
            stationaryPoints.storageLink.x,
            stationaryPoints.storageLink.y,
            room.name,
        )
        const containerStationaryPos = new RoomPosition(
            stationaryPoints.controllerLink.x,
            stationaryPoints.controllerLink.y,
            room.name,
        )
        const sourceStationaryPos = Object.values(stationaryPoints.sources).map(
            (pos) => new RoomPosition(pos.x, pos.y, room.name),
        )

        const storageLinks = storageStationaryPos.findInRange(FIND_MY_STRUCTURES, 1, {
            filter: { structureType: STRUCTURE_LINK },
        })
        const containerLinks = containerStationaryPos.findInRange(FIND_MY_STRUCTURES, 1, {
            filter: { structureType: STRUCTURE_LINK },
        })
        const sourceLinks = sourceStationaryPos.map(
            (pos) =>
                pos.findInRange(FIND_MY_STRUCTURES, 1, {
                    filter: { structureType: STRUCTURE_LINK },
                })[0],
        )
        if (storageLinks)
    }
        */
}
