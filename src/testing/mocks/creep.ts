import { mockInstanceOf } from 'screeps-jest'
import { v4 as uuidv4 } from 'uuid'
import { ROOM_NAME } from '../constants'

export function createCreep<T extends Creep>(parts: BodyPartConstant[]): T {
    const id = uuidv4() as Id<T>
    const name = `creep:${id}`
    const room = Memory.rooms[ROOM_NAME]
    const source = room.sources[0]
    const getCapacity = (): number => {
        return parts.reduce(
            (acc, val) => (val === CARRY ? acc + CARRY_CAPACITY : acc),
            0,
        )
    }
    return mockInstanceOf<Creep>({
        id,
        name,
        store: { getCapacity, getFreeCapacity: getCapacity },
        room: { name: ROOM_NAME },
        memory: { source: source.id as Id<Source> },
        pos: new RoomPosition(0, 0, ROOM_NAME),
    }) as T
}
