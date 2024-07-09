import * as Logger from 'utils/logger'
import { Position } from 'types'
import { getCalculatedLinks } from 'surveyor'

declare global {
    namespace NodeJS {
        interface Global {
            createLinkManager(room: Room): LinkManager | null
        }
    }
}

global.createLinkManager = (room: Room): LinkManager | null => {
    return LinkManager.createFromRoom(room)
}

const getLinkFromPosition = (room: Room, pos: Position): StructureLink | null => {
    const rp = new RoomPosition(pos.x, pos.y, room.name)
    return (
        room
            .find<StructureLink>(FIND_MY_STRUCTURES, {
                filter: { structureType: STRUCTURE_LINK },
            })
            .filter((link) => link.pos.isEqualTo(rp))[0] || null
    )
}

export default class LinkManager {
    public static cache = new Map<string, LinkManager>()

    public readonly storageLink: StructureLink | null
    public readonly controllerLink: StructureLink | null
    public readonly sourceLinks: StructureLink[]

    public constructor(
        storageLink: StructureLink | null,
        containerLink: StructureLink | null,
        sourceLinks: StructureLink[],
    ) {
        this.storageLink = storageLink
        this.controllerLink = containerLink
        this.sourceLinks = sourceLinks
    }

    public static createFromRoom(room: Room): LinkManager | null {
        const storedLinks = getCalculatedLinks(room)
        if (storedLinks === null) {
            Logger.warning('link-manager:create-from-room:no-links', room.name)
            return null
        }
        const storageLink = getLinkFromPosition(room, storedLinks.storage)
        const controllerLink = getLinkFromPosition(room, storedLinks.controller)
        const sourceLinks = storedLinks.sourceContainers
            .map(({ link }) => getLinkFromPosition(room, link))
            .reduce((acc, link) => {
                if (link === null || acc.some((l) => l.id === link.id)) {
                    return acc
                }
                return acc.concat(link)
            }, [] as StructureLink[])
        return new LinkManager(storageLink, controllerLink, sourceLinks)
    }

    public static hasControllerLink(room: Room): boolean {
        const linkManager = LinkManager.createFromRoom(room)
        return Boolean(linkManager && linkManager.controllerLink !== null)
    }

    get sources(): StructureLink[] {
        return this.sourceLinks
    }

    get sinks(): StructureLink[] {
        return [this.controllerLink, this.storageLink].filter(
            (link) => link !== null,
        ) as StructureLink[]
    }

    public run(): void {
        const sinkTracker = this.sinks.map((link) => ({
            amount: link.store.getFreeCapacity(RESOURCE_ENERGY),
            link,
        }))
        for (const source of this.sources) {
            const amount = source.store.getUsedCapacity(RESOURCE_ENERGY)
            if (amount === 0 || source.cooldown > 0) {
                continue
            }
            const emptySinks = sinkTracker.filter((sink) => sink.amount >= amount)
            if (emptySinks.length > 0) {
                const emptySink = emptySinks[0]
                const err = source.transferEnergy(emptySink.link)
                if (err === OK) {
                    emptySink.amount -= amount
                    Logger.info(
                        'link-manager:run:transfer',
                        source.id,
                        emptySink.link.id,
                        emptySink.link.room.name,
                        amount,
                    )
                    continue
                } else {
                    Logger.error(
                        'link-manager:run:transfer:failed',
                        source.id,
                        emptySink.link.id,
                        emptySink.link.room.name,
                        amount,
                        emptySink.link.store.getFreeCapacity(RESOURCE_ENERGY),
                        JSON.stringify(emptySink),
                        err,
                    )
                }
            }
            const fillableSinks = sinkTracker.filter((sink) => sink.amount > 0)
            if (fillableSinks.length > 0) {
                const fillableSink = fillableSinks[0]
                const err = source.transferEnergy(fillableSink.link)
                if (err === OK) {
                    fillableSink.amount = 0
                    Logger.info(
                        'link-manager:run:transfer:fill',
                        source.id,
                        fillableSink.link.id,
                        fillableSink.amount,
                        fillableSink.link.room.name,
                    )
                    continue
                } else {
                    Logger.error(
                        'link-manager:run:transfer:fill:failed',
                        source.id,
                        fillableSink.link.id,
                        fillableSink.link.room.name,
                        amount,
                        fillableSink.link.store.getFreeCapacity(RESOURCE_ENERGY),
                        JSON.stringify(fillableSink),
                        err,
                    )
                }
            }
        }
    }
}
