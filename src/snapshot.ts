import { Map, Record, RecordOf, Set } from 'immutable'
import { getConstructionFlags, STRUCTURE_COLORS } from 'utils/flags'

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

export default class RoomSnapshot {
    readonly roomName: string
    snapshot: ImmutableSnapshot

    constructor(snapshot: ImmutableSnapshot, roomName: string) {
        this.roomName = roomName
        this.snapshot = snapshot
    }

    get room(): Room {
        return Game.rooms[this.roomName]
    }

    getStructurePos(
        testStructureType: BuildableStructureConstant,
        filter?: (pos: RoomPosition) => boolean,
    ): RoomPosition | null {
        for (const [pos, structureTypes] of this.snapshot) {
            for (const structureType of structureTypes) {
                if (structureType === testStructureType) {
                    const roomPosition = new RoomPosition(
                        pos.x,
                        pos.y,
                        pos.roomName,
                    )
                    const lookStructures = roomPosition.lookFor(LOOK_STRUCTURES)
                    const hasStructure = lookStructures.some(
                        ls => ls.structureType === structureType,
                    )

                    if (!hasStructure && (!filter || filter(roomPosition))) {
                        return roomPosition
                    }
                }
            }
        }
        return null
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
        this.loadFromFlags()
        const structures = this.room.find(FIND_STRUCTURES)
        for (const structure of structures) {
            this.addStructure(structure.structureType, structure.pos)
        }
    }

    loadFromFlags() {
        for (const flag of getConstructionFlags(this.room)) {
            const structureType = STRUCTURE_COLORS.get(
                flag.color,
            ) as BuildableStructureConstant
            this.addStructure(structureType, flag.pos)
            flag.remove()
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
