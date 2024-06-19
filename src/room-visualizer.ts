import filter from 'lodash/filter'
import * as Logger from 'utils/logger'

type DrawFunction = (visual: RoomVisual, pos: RoomPosition) => void

const STRUCTURE_VISUALS = new Map<StructureConstant, DrawFunction>([
    [STRUCTURE_RAMPART, drawRampart],
    [STRUCTURE_WALL, drawWall],
    [STRUCTURE_STORAGE, drawStorage],
    [STRUCTURE_LINK, drawLink],
    [STRUCTURE_CONTAINER, drawContainer],
    [STRUCTURE_EXTENSION, drawExtension],
    [STRUCTURE_ROAD, drawRoad],
    [STRUCTURE_TOWER, drawTower],
    [STRUCTURE_SPAWN, drawSpawn],
])

function drawRampart(visual: RoomVisual, pos: RoomPosition): void {
    visual.circle(pos, { fill: 'red', radius: 0.35 })
}

function drawWall(visual: RoomVisual, pos: RoomPosition): void {
    visual.rect(pos.x - 0.5, pos.y - 0.5, 0.99, 0.99, { fill: 'grey' })
}

function drawTower(visual: RoomVisual, pos: RoomPosition): void {
    visual.circle(pos, { fill: 'black', radius: 0.45 })
}

function drawStorage(visual: RoomVisual, pos: RoomPosition): void {
    visual.rect(pos.x - 0.5, pos.y - 1, 0.99, 1.99, { fill: 'white' })
}

function drawLink(visual: RoomVisual, pos: RoomPosition): void {
    visual.text('♦️', pos.x, pos.y + 0.25, { color: 'yellow', font: 0.95 })
}

function drawSpawn(visual: RoomVisual, pos: RoomPosition): void {
    visual.text('🏭', pos.x, pos.y + 0.25, { color: 'green', font: 0.95 })
}

function drawContainer(visual: RoomVisual, pos: RoomPosition): void {
    visual.circle(pos, { fill: 'grey', radius: 0.45 })
}

function drawExtension(visual: RoomVisual, pos: RoomPosition): void {
    {
    }
    visual.circle(pos, { fill: 'yellow', radius: 0.45 })
}

function drawRoad(visual: RoomVisual, pos: RoomPosition): void {
    visual.text('🧱', pos.x, pos.y + 0.25, { color: 'red', font: 0.95 })
}

function hasStructureAt(structureType: StructureConstant, pos: RoomPosition) {
    const structures = pos.lookFor(LOOK_STRUCTURES)
    return filter(structures, { structureType }).length > 0
}

function hasConstructionSiteAt(structureType: BuildableStructureConstant, pos: RoomPosition) {
    const sites = pos.lookFor(LOOK_CONSTRUCTION_SITES)
    return filter(sites, { structureType }).length > 0
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

    render(roads = false) {
        if (!this.visuals.snapshot) {
            return
        }
        if (!this.room.memory.constructionFeatures) {
            return
        }
        for (const [structureType, positions] of Object.entries(
            this.room.memory.constructionFeatures,
        )) {
            if (structureType === STRUCTURE_ROAD && !roads) {
                continue
            }
            for (const pos of positions) {
                const roomPos = new RoomPosition(pos.x, pos.y, this.room.name)
                if (
                    hasStructureAt(structureType as BuildableStructureConstant, roomPos) ||
                    hasConstructionSiteAt(structureType as BuildableStructureConstant, roomPos)
                ) {
                    continue
                }
                const drawFunction = STRUCTURE_VISUALS.get(
                    structureType as BuildableStructureConstant,
                )
                if (drawFunction) {
                    drawFunction(this.room.visual, roomPos)
                } else {
                    Logger.warning('room-visualizer:render:missing', structureType)
                }
            }
        }
    }
}

export function visualizeRoom(roomName: string, on = true) {
    Game.rooms[roomName].memory.visuals.snapshot = on
}
