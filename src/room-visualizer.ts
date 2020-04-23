import filter from 'lodash/filter'
import * as Logger from 'utils/logger'

type DrawFunction = (visual: RoomVisual, pos: RoomPosition) => void

const STRUCTURE_VISUALS = new Map<StructureConstant, DrawFunction>([
    [STRUCTURE_RAMPART, drawRampart],
])

function drawRampart(visual: RoomVisual, pos: RoomPosition): void {
    visual.circle(pos, { fill: 'green', radius: 0.45 })
}

function hasStructureAt(structureType: StructureConstant, pos: RoomPosition) {
    const structures = pos.lookFor(LOOK_STRUCTURES)
    return filter(structures, { structureType }).length > 0
}

export default class RoomVisualizer {
    readonly room: Room

    constructor(room: Room) {
        this.room = room
        if (!this.room.memory.visuals) {
            this.room.memory.visuals = { snapshot: false }
        }
    }

    get visuals() {
        return this.room.memory.visuals
    }

    render() {
        if (!this.visuals.snapshot) {
            return
        }
        for (const { pos, structureType } of this.room.memory.snapshot) {
            const roomPos = new RoomPosition(pos.x, pos.y, pos.roomName)
            const drawFunction = STRUCTURE_VISUALS.get(structureType)

            if (hasStructureAt(structureType, roomPos)) {
                continue
            }
            if (drawFunction) {
                drawFunction(this.room.visual, roomPos)
            } else {
                Logger.warning('room-visualizer:render:missing', structureType)
            }
        }
    }
}

export function visualizeRoom(roomName: string, on = true) {
    Game.rooms[roomName].memory.visuals.snapshot = on
}
