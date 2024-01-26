import { Map, Record, RecordOf, Set } from 'immutable'
import { STRUCTURE_COLORS, getConstructionFlags } from 'utils/flags'
import { profile, wrap } from 'utils/profiling'

type RoomSnapshotMemory = {
    pos: FlatRoomPosition
    structureType: StructureConstant
}[]

declare global {
    interface RoomMemory {
        snapshot: RoomSnapshotMemory
    }
}

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
    public readonly roomName: string
    public snapshot: ImmutableSnapshot

    public constructor(snapshot: ImmutableSnapshot, roomName: string) {
        this.roomName = roomName
        this.snapshot = snapshot
    }

    public get room(): Room {
        return Game.rooms[this.roomName]
    }

    public getStructurePos(
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
                        (ls) => ls.structureType === structureType,
                    )

                    if (!hasStructure && (!filter || filter(roomPosition))) {
                        return roomPosition
                    }
                }
            }
        }
        return null
    }

    public hasStructure(structureType: BuildableStructureConstant) {
        return this.getStructurePos(structureType) !== null
    }

    public addStructure(
        structureType: StructureConstant,
        pos: FlatRoomPosition,
    ) {
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

    public loadFromRoom() {
        this.loadFromFlags()
        const structures = this.room.find(FIND_STRUCTURES)
        for (const structure of structures) {
            this.addStructure(structure.structureType, structure.pos)
        }
    }

    public loadFromFlags() {
        for (const flag of getConstructionFlags(this.room)) {
            const structureType = STRUCTURE_COLORS.get(
                flag.color,
            ) as BuildableStructureConstant
            this.addStructure(structureType, flag.pos)
            flag.remove()
        }
    }

    public saveToMemory() {
        const snapshotMemory = []
        for (const [pos, structureTypes] of this.snapshot) {
            for (const structureType of structureTypes) {
                snapshotMemory.push({ pos, structureType })
            }
        }
        this.room.memory.snapshot = snapshotMemory
        updateCache(this.room, this)
    }

    public reset() {
        this.snapshot = Map()
    }

    public static create = wrap((room: Room): RoomSnapshot => {
        const snapshotMemory = room.memory.snapshot
        const snapshot = new RoomSnapshot(Map(), room.name)
        if (!snapshotMemory) {
            return snapshot
        }
        for (const { pos, structureType } of snapshotMemory) {
            snapshot.addStructure(structureType, pos)
        }
        return snapshot
    }, 'RoomSnapshot:create')

    @profile
    public static get(room: Room): RoomSnapshot {
        if (!cache.hasOwnProperty(room.name)) {
            const snapshot = RoomSnapshot.create(room)
            updateCache(room, snapshot)
        }
        return cache[room.name]
    }
}

export function saveSnapshot(roomName: string) {
    const room = Game.rooms[roomName]
    const roomSnapshot = RoomSnapshot.create(room)
    roomSnapshot.loadFromRoom()
    roomSnapshot.saveToMemory()
}

export function resetSnapshot(roomName: string) {
    const room = Game.rooms[roomName]
    const roomSnapshot = RoomSnapshot.create(room)
    roomSnapshot.reset()
    roomSnapshot.loadFromRoom()
    roomSnapshot.saveToMemory()
}

interface RoomCache {
    [roomName: string]: RoomSnapshot
}

const cache: RoomCache = {}

export function updateCache(room: Room, snapshot: RoomSnapshot) {
    cache[room.name] = snapshot
}
