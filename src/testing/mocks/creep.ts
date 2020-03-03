import { mockInstanceOf } from 'screeps-jest'
import { v4 as uuidv4 } from 'uuid'
import { ROOM_NAME } from '../constants'

export default (parts: BodyPartConstant[]) => {
    const id = uuidv4() as Id<SourceCreep>
    const name = `creep:${id}`
    const room = Memory.rooms[ROOM_NAME]
    const source = room.sources[0]
    return mockInstanceOf<SourceCreep>({
        id,
        name: `creep:${id}`,
        store: {
            getCapacity: () => {
                return parts.reduce(
                    (acc, val) => (val === CARRY ? acc + CARRY_CAPACITY : acc),
                    0,
                )
            },
        },
        room: { name: 'test' },
        memory: { source: source.id as Id<Source> },
        pos: new RoomPosition(0, 0, ROOM_NAME),
    })
}
