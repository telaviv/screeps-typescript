import { getContainerAtPosition, hasContainerAtPosition } from 'utils/room'
import { getStationaryPoints } from 'surveyor'

export default class DroppedEnergyManager {
    static cache = new Map<number, DroppedEnergyManager>()
    pos: RoomPosition

    public constructor(pos: RoomPosition) {
        this.pos = pos
    }

    public static createFromSourceId(id: Id<Source>): DroppedEnergyManager {
        const source = Game.getObjectById(id)
        if (!source) throw new Error(`Invalid source id: ${id}`)
        const points = getStationaryPoints(source.room)
        const point = points?.sources[id]
        if (!point)
            throw new Error(
                `Invalid source id: ${id}. We have ${JSON.stringify(points?.sources)} in room ${
                    source.room.name
                }`,
            )
        const { x, y } = point
        return new DroppedEnergyManager(new RoomPosition(x, y, source.room.name))
    }

    public get room(): Room {
        return Game.rooms[this.pos.roomName]
    }

    public hasContainer(): boolean {
        return hasContainerAtPosition(this.room, this.pos)
    }

    public getContainer(): StructureContainer | null {
        return getContainerAtPosition(this.room, this.pos)
    }
}
