const isRoad = (structure: any): boolean => {
    return structure.structureType === STRUCTURE_ROAD
}

const createWallConstructionSites = (room: Room) => {
    console.log('create wall construction sites')
    const SIZE = 6

    const spawns = room.find(FIND_MY_SPAWNS) as StructureSpawn[]
    const spawn = spawns[0]
    const top = spawn.pos.y - SIZE
    const bottom = spawn.pos.y + SIZE
    const left = spawn.pos.x - SIZE
    const right = spawn.pos.y + SIZE
    const terrain = room.getTerrain()

    room.visual.rect(left, top, SIZE * 2, SIZE * 2, { fill: 'green' })

    console.log('about to create walls')
    for (let x = left; x < right; ++x) {
        for (let y = top; y < bottom; ++y) {
            if (terrain.get(x, y) === TERRAIN_MASK_WALL) {
                continue
            }

            if (
                !(
                    x === left ||
                    x + 1 === right ||
                    y === top ||
                    y + 1 === bottom
                )
            ) {
                continue
            }

            if (_.some(room.lookForAt(LOOK_STRUCTURES, x, y), isRoad)) {
                room.createConstructionSite(x, y, STRUCTURE_RAMPART)
            }

            console.log(`creating wall (${x}, ${y})`)
            console.log(
                'exit code: ' +
                    room.createConstructionSite(x, y, STRUCTURE_WALL),
            )
        }
    }
    room.memory.wallsAssigned = true
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
    room.memory.roadsAssigned = true
}

const assignRoomFeatures = () => {
    _.each(Game.rooms, room => {
        if (!room.memory.roadsAssigned || Game.time % 300 === 0) {
            createRoadConstructionSites(room)
        }

        createWallConstructionSites(room)
        if (!room.memory.wallsAssigned || Game.time % 350 === 0) {
            createWallConstructionSites(room)
        }
    })
}

const survey = () => {
    assignRoomFeatures()
}

export default survey
