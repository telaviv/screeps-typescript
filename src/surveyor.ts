const findRoadPath = (origin: RoomPosition, goal: RoomPosition) => {
    return PathFinder.search(origin, goal, { swampCost: 1 })
}

const createRoadConstructionSites = (room: Room) => {
    let moveCenters: RoomObject[] = []
    const spawns = room.find(FIND_MY_SPAWNS) as StructureSpawn[]
    const sources = room.find(FIND_SOURCES) as Source[]
    moveCenters.push(room.controller as RoomObject)
    moveCenters = moveCenters.concat(spawns)
    moveCenters = moveCenters.concat(sources)

    for (const i of _.range(0, moveCenters.length - 1)) {
        for (const j of _.range(i, moveCenters.length)) {
            const path = findRoadPath(moveCenters[i].pos, moveCenters[j].pos)
            for (const pos of path.path) {
                room.createConstructionSite(pos, STRUCTURE_ROAD)
            }
        }
    }
    room.memory.roadsAssigned = true
}

const assignRoomFeatures = () => {
    _.each(Game.rooms, room => {
        if (!room.memory.roadsAssigned) {
            createRoadConstructionSites(room)
        }
    })
}

const survey = () => {
    assignRoomFeatures()
}

export default survey
