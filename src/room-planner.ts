import { FlatRoomPosition } from "types"

declare global {
    interface RoomMemory {
        plan: RoomPlan
    }
}

interface LinkPlan {
    sources: { [sourceId: string]: FlatRoomPosition }
    mineral?: FlatRoomPosition
    storage?: FlatRoomPosition
    controller?: FlatRoomPosition
}

interface RoomPlan {
    links: LinkPlan
    storage?: FlatRoomPosition
}

export default class RoomPlanner {
    readonly room: Room

    constructor(room: Room) {
        this.room = room
        if (!this.plan) {
            this.plan = {
                links: {
                    sources: {} as { [id: string]: FlatRoomPosition },
                },
            }
        }

        if (!this.plan.links) {
            this.plan.links = {
                sources: {} as { [id: string]: FlatRoomPosition },
            }
        }

        if (!this.plan.links.sources) {
            this.plan.links.sources = {} as { [id: string]: FlatRoomPosition }
        }
    }

    get plan() {
        return this.room.memory.plan
    }

    set plan(plan: RoomPlan) {
        this.room.memory.plan = plan
    }

    get links() {
        return this.plan.links
    }

    get storage() {
        return this.plan.storage
    }

    setSourceLink(id: Id<Source>, pos: FlatRoomPosition) {
        this.links.sources[id] = pos
    }

    setMineralLink(pos: FlatRoomPosition) {
        this.links.mineral = pos
    }

    setStorageLink(pos: FlatRoomPosition) {
        this.links.storage = pos
    }

    setControllerLink(pos: FlatRoomPosition) {
        this.links.controller = pos
    }

    setStoragePosition(pos: FlatRoomPosition) {
        this.plan.storage = pos
    }

    planIsFinished(): boolean {
        const sourceCount = this.room.find(FIND_SOURCES).length

        return !!(
            this.plan.storage &&
            this.links &&
            this.links.sources &&
            this.links.controller &&
            Object.keys(this.links.sources).length === sourceCount &&
            this.links.storage
        )
    }
}
