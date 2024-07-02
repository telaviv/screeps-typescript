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
        const sortArray = [
            { type: 'storage', pos: storageStationaryPos, links: [] as StructureLink[] },
            { type: 'controller', pos: containerStationaryPos, links: [] as StructureLink[] },
            ...sourceStationaryPos.map((pos) => ({
                type: 'source',
                pos,
                links: [] as StructureLink[],
            })),
        ]
        for (const struct of sortArray) {
            const { pos } = struct
            const links = pos.findInRange<StructureLink>(FIND_MY_STRUCTURES, 1, {
                filter: { structureType: STRUCTURE_LINK },
            })
            struct.links = links
        }
        sortArray.sort((a, b) => a.links.length - b.links.length)
        const usedLinks = [] as Id<StructureLink>[]
        const sourceLinks = [] as StructureLink[]
        let storageLink: StructureLink | null = null
        let controllerLink: StructureLink | null = null
        for (const { type, links, pos } of sortArray) {
            if (links.length === 0) {
                throw new Error(
                    `No link found for ${type} in room ${room.name} at ${JSON.stringify(pos)}`,
                )
            }
            const link = links.find((l) => !usedLinks.includes(l.id))
            if (!link) {
                throw new Error(
                    `No unused link found for ${type} in room ${room.name} at ${JSON.stringify(
                        pos,
                    )}: ${JSON.stringify(usedLinks)}`,
                )
            }
            usedLinks.push(link.id)
            if (type === 'source') sourceLinks.push(link)
            if (type === 'storage') storageLink = link
            if (type === 'controller') controllerLink = link
        }
        if (!storageLink) throw new Error(`No storage link found in room ${room.name}`)
        if (!controllerLink) throw new Error(`No controller link found in room ${room.name}`)
        if (sourceLinks.length !== 2) {
            throw new Error(`Expected 2 source links, found ${sourceLinks.length}`)
        }
        return new LinkManager(storageLink, controllerLink, sourceLinks)
    }
}
