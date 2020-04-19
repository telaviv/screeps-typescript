/* eslint @typescript-eslint/no-unused-vars: ['off'] */

import * as PositionSet from 'utils/roomPositionSet'
import range from 'lodash/range'
import each from 'lodash/each'

const getSpawn = (room: Room): StructureSpawn => {
    return room.find(FIND_MY_SPAWNS)[0]
}

const assignSources = (room: Room) => {
    const sources = room.find(FIND_SOURCES)
    const spawn = getSpawn(room)
    if (!spawn) {
        return
    }

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

const assignRoomFeatures = () => {
    each(Game.rooms, room => {
        if (!room.memory.sources || room.memory.sources.length === 0) {
            assignSources(room)
        }
    })
}

const survey = () => {
    assignRoomFeatures()
}

export default survey
