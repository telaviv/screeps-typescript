import { mockInstanceOf } from 'screeps-jest'
import { v4 as uuidv4 } from 'uuid'
import { Logistics, TASK_COLLECTING, TASK_HAULING } from 'roles/logistics'

import { ROOM_NAME } from '../constants'

export function createCreep<T extends Creep>(parts: BodyPartConstant[]): T {
    const id = uuidv4() as Id<T>
    const name = `creep:${id}`
    const getCapacity = (): number => {
        return parts.reduce(
            (acc, val) => (val === CARRY ? acc + CARRY_CAPACITY : acc),
            0,
        )
    }
    return mockInstanceOf<Creep>({
        id,
        name,
        store: {
            getCapacity,
            getFreeCapacity: getCapacity,
            getUsedCapacity: () => 0,
        },
        room: Game.rooms[ROOM_NAME],
        memory: {},
        pos: new RoomPosition(0, 0, ROOM_NAME),
    }) as T
}

export function createSourceCreep<T extends SourceCreep>(
    parts: BodyPartConstant[],
): T {
    const room = Memory.rooms[ROOM_NAME]
    const source = room.sources[0]
    const creep = createCreep<T>(parts)
    creep.memory.source = source.id as Id<Source>
    return creep
}

export function createLogisticsCreep(parts: BodyPartConstant[]): Logistics {
    const creep = createSourceCreep<Logistics>(parts)
    creep.memory.currentTask = TASK_COLLECTING
    creep.memory.preference = TASK_HAULING
    return creep
}
