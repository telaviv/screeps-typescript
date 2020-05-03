import { getSources } from 'utils/room'

declare global {
    interface RoomMemory {
        plan: RoomPlan
    }
}

interface LinkPlan {
    sources: { [sourceId: string]: FlatRoomPosition }
    mineral?: FlatRoomPosition
    storage?: FlatRoomPosition
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
            this.room.memory.plan = {
                links: {
                    sources: {} as { [id: string]: FlatRoomPosition },
                },
            }
        }

        if (!this.room.memory.sources) {
            this.room.memory.sources = [] as RoomSourceMemory[]
        }
    }

    get plan() {
        return this.room.memory.plan
    }

    get links() {
        return this.plan.links
    }

    get sources() {
        // notice it's not actually on the plan. Let's fix that
        return this.room.memory.sources
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

    setStoragePosition(pos: FlatRoomPosition) {
        this.plan.storage = pos
    }

    planIsFinished() {
        const sourceCount = getSources(this.room).length

        return (
            sourceCount === this.sources.length &&
            this.plan.storage &&
            Object.keys(this.links.sources).length === sourceCount &&
            this.links.storage
        )
    }
}
