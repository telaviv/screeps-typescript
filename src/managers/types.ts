interface RoomSourceMemory {
    id: Id<Source>
    dropSpot: DroppedEnergyMemory
}

interface DroppedEnergyMemory {
    pos: FlatRoomPosition
}
