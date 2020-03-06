import * as PositionSet from 'utils/roomPositionSet'
import range from 'lodash/range'
import each from 'lodash/each'

const getSpawn = (room: Room): StructureSpawn => {
    return room.find(FIND_MY_SPAWNS)[0]
}

const createWallConstructionSites = (room: Room) => {
    const SIZE = 13
    const HALF = (SIZE - 1) / 2

    const spawn = getSpawn(room)
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
        }
    }
}

const findRoadPath = (origin: RoomPosition, goal: RoomPosition) => {
    return PathFinder.search(origin, { pos: goal, range: 1 }, { swampCost: 1 })
}

const createRoadConstructionSites = (room: Room) => {
    const roadPositions: RoomPositionSet = []
    let moveCenters: RoomObject[] = []
    const spawns = room.find(FIND_MY_SPAWNS)
    const sources = room.find(FIND_SOURCES)
    moveCenters.push(room.controller as RoomObject)
    moveCenters = moveCenters.concat(spawns)
    moveCenters = moveCenters.concat(sources)

    for (const i of range(0, moveCenters.length - 1)) {
        for (const j of range(i, moveCenters.length)) {
            const path = findRoadPath(moveCenters[i].pos, moveCenters[j].pos)
            PositionSet.merge(path.path, roadPositions)
            for (const pos of path.path) {
                room.createConstructionSite(pos, STRUCTURE_ROAD)
            }
        }
    }
    room.memory.roadPositions = roadPositions
    room.memory.hasAssignedRoads = true
}

const assignSources = (room: Room) => {
    const sources = room.find(FIND_SOURCES)
    const spawn = getSpawn(room)

    room.memory.sources = []
    for (const source of sources) {
        const path = PathFinder.search(
            spawn.pos,
            { pos: source.pos, range: 1 },
            { swampCost: 1 },
        ).path
        room.memory.sources.push({
            id: source.id,
            dropSpot: {
                pos: path[path.length - 1],
                requests: [],
            },
        })
    }
}

const createSurvey = (room: Room) => {
    const roadPositions: RoomPositionSet = []
    let moveCenters: RoomObject[] = []
    const spawns = room.find(FIND_MY_SPAWNS)
    const sources = room.find(FIND_SOURCES)
    moveCenters.push(room.controller as RoomObject)
    moveCenters = moveCenters.concat(spawns)
    moveCenters = moveCenters.concat(sources)

    for (const i of range(0, moveCenters.length - 1)) {
        for (const j of range(i, moveCenters.length)) {
            const path = findRoadPath(moveCenters[i].pos, moveCenters[j].pos)
            PositionSet.merge(path.path, roadPositions)
            for (const pos of path.path) {
                room.createConstructionSite(pos, STRUCTURE_ROAD)
            }
        }
    }

    room.memory.survey = { roads: roadPositions }
}

const assignRoomFeatures = () => {
    each(Game.rooms, room => {
        if (!room.memory.survey) {
            createSurvey(room)
        }

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
