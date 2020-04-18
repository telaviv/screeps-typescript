import { Map, Record, RecordOf, Set } from 'immutable'

interface FlatRoomPosition {
    x: number
    y: number
    roomName: string
}

const FlatRoomPositionRecord = Record<FlatRoomPosition>({
    x: 0,
    y: 0,
    roomName: '',
})

type ImmutableSnapshot = Map<RecordOf<FlatRoomPosition>, Set<StructureConstant>>

class RoomSnapshot {
    readonly roomName: string
    snapshot: ImmutableSnapshot

    constructor(snapshot: ImmutableSnapshot, roomName: string) {
        this.roomName = roomName
        this.snapshot = snapshot
    }

    get room(): Room {
        return Game.rooms[this.roomName]
    }

    addStructure(structureType: StructureConstant, pos: FlatRoomPosition) {
        const immPos = new FlatRoomPositionRecord({
            x: pos.x,
            y: pos.y,
            roomName: pos.roomName,
        })
        let structureSet = this.snapshot.get(immPos)
        if (!structureSet) {
            structureSet = Set()
        }
        structureSet = structureSet.add(structureType)

        this.snapshot = this.snapshot.set(immPos, structureSet)
    }

    loadFromRoom() {
        const structures = this.room.find(FIND_STRUCTURES)
        for (const structure of structures) {
            this.addStructure(structure.structureType, structure.pos)
        }
    }

    saveToMemory() {
        const snapshotMemory = []
        for (const [pos, structureTypes] of this.snapshot) {
            for (const structureType of structureTypes) {
                snapshotMemory.push({ pos, structureType })
            }
        }
        this.room.memory.snapshot = snapshotMemory
    }

    static create(room: Room): RoomSnapshot {
        const snapshotMemory = room.memory.snapshot
        const snapshot = new RoomSnapshot(Map(), room.name)
        for (const { pos, structureType } of snapshotMemory) {
            snapshot.addStructure(structureType, pos)
        }
        return snapshot
    }
}

export function saveSnapshot(roomName: string) {
    const room = Game.rooms[roomName]
    const roomSnapshot = RoomSnapshot.create(room)
    roomSnapshot.loadFromRoom()
    roomSnapshot.saveToMemory()
}
