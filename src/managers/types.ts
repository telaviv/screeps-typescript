import { FlatRoomPosition } from "types"

export interface RoomSourceMemory {
    id: Id<Source>
    dropSpot: DroppedEnergyMemory
}

export interface DroppedEnergyMemory {
    pos: FlatRoomPosition
}

declare global {
    interface RoomMemory {
        sources: RoomSourceMemory[]
    }
}
