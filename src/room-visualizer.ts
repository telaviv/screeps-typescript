import * as Logger from 'utils/logger'
import { ConstructionFeatures } from 'types'
import filter from 'lodash/filter'
import { getConstructionFeatures } from 'surveyor'
import { getWallTransform } from 'room-analysis/distance-transform'

type VisualType = 'construction' | 'wall-transform'

declare global {
    interface RoomMemory {
        visuals:
            | {
                  visualType: VisualType
                  showRoads?: boolean
                  transform?: number[][]
              }
            | undefined
    }

    namespace NodeJS {
        interface Global {
            visuals: {
                construction: (roomName: string, roads?: boolean) => void
                wallTransform: (roomName: string) => void
                cancel: (roomName: string) => void
            }
        }
    }
}

global.visuals = {
    construction: setConstructionVisuals,
    wallTransform: setWallTransformVisuals,
    cancel: cancelVisuals,
}

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

function drawNumber(visual: RoomVisual, pos: RoomPosition, num: number): void {
    visual.text(num.toString(), pos.x, pos.y + 0.25, { color: 'red', font: 0.95 })
}

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
    }

    renderConstructionFeatures(constructionFeatures: ConstructionFeatures, roads = false): void {
        for (const [structureType, positions] of Object.entries(constructionFeatures)) {
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

    renderTransform(transform: number[][]): void {
        for (let x = 0; x < 50; x++) {
            for (let y = 0; y < 50; y++) {
                const value = transform[x][y]
                if (value === Infinity || value === 0) {
                    continue
                }
                drawNumber(this.room.visual, new RoomPosition(x, y, this.room.name), value)
            }
        }
    }
}

export function visualizeRoom(room: Room): void {
    const visuals = room.memory.visuals
    if (!visuals) {
        return
    }
    const roomVisual = new RoomVisualizer(room)
    if (visuals.visualType === 'construction') {
        const constructionFeatures = getConstructionFeatures(room)
        if (!constructionFeatures) {
            console.log('no construction features for room', room.name)
            return
        }
        roomVisual.renderConstructionFeatures(constructionFeatures, visuals.showRoads)
    } else if (visuals.visualType === 'wall-transform') {
        roomVisual.renderTransform(visuals.transform as number[][])
    }
}

function setConstructionVisuals(roomName: string, roads = false): void {
    const room = Game.rooms[roomName]
    room.memory.visuals = { visualType: 'construction', showRoads: roads }
}

function setWallTransformVisuals(roomName: string): void {
    const room = Game.rooms[roomName]
    const wallTransform = getWallTransform(room)
    room.memory.visuals = { visualType: 'wall-transform', transform: wallTransform }
}

function cancelVisuals(roomName: string): void {
    Game.rooms[roomName].memory.visuals = undefined
}
