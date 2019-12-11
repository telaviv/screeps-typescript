const isRoad = (structure: any): boolean => {
    return structure.structureType === STRUCTURE_ROAD
}

const createWallConstructionSites = (room: Room) => {
    const SIZE = 13
    const HALF = (SIZE - 1) / 2

    const spawns = room.find(FIND_MY_SPAWNS) as StructureSpawn[]
    const spawn = spawns[0]
    const top = spawn.pos.y - HALF
    const left = spawn.pos.x - HALF
    const terrain = room.getTerrain()

    for (let x = left; x < left + SIZE; ++x) {
        for (let y = top; y < top + SIZE; ++y) {
            if (terrain.get(x, y) === TERRAIN_MASK_WALL) {
                continue
            }

            if (room.lookForAt(LOOK_CONSTRUCTION_SITES, x, y).length > 0) {
                continue
            }

            if (
                !(
                    x === left ||
                    x + 1 === left + SIZE ||
                    y === top ||
                    y + 1 === top + SIZE
                )
            ) {
                continue
            }

            let code
            if (_.some(room.lookForAt(LOOK_STRUCTURES, x, y), isRoad)) {
                code = room.createConstructionSite(x, y, STRUCTURE_RAMPART)
                if (!_.any([OK, ERR_FULL])) {
                    console.log(`rampart creation failed (${x}, ${y}): ${code}`)
                }
            }

            code = room.createConstructionSite(x, y, STRUCTURE_WALL)
            if (!_.any([OK, ERR_FULL])) {
                console.log(`wall creation failed (${x}, ${y}): ${code}`)
            }
        }
    }
}

const findRoadPath = (origin: RoomPosition, goal: RoomPosition) => {
    return PathFinder.search(origin, { pos: goal, range: 1 }, { swampCost: 1 })
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
    room.memory.hasAssignedRoads = true
}

const assignSources = (room: Room) => {
    const sources = room.find(FIND_SOURCES) as Source[]
    room.memory.sources = sources.map(source => ({ id: source.id }))
}

const assignRoomFeatures = () => {
    _.each(Game.rooms, room => {
        console.log('hoping to assign sources')
        if (!room.memory.sources || room.memory.sources.length === 0) {
            assignSources(room)
        }

        if (!room.memory.hasAssignedRoads || Game.time % 100 === 0) {
            createRoadConstructionSites(room)
        }

        if (
            room.controller &&
            room.controller.level > 1 &&
            Game.time % 100 === 50
        ) {
            createWallConstructionSites(room)
        }
    })
}

const survey = () => {
    assignRoomFeatures()
}

export default survey
