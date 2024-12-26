import colormap from 'colormap'
import filter from 'lodash/filter'

import * as Logger from 'utils/logger'
import { ConstructionFeatures, getConstructionFeatures } from 'construction-features'
import { getConstructionFeaturesV3 } from 'construction-features'
import {
    getSumTransform,
    getTransformFromId,
    getWallTransform,
} from 'room-analysis/distance-transform'
import { findMyRooms } from 'utils/room'

const MAX_BUNKER_DIMENSION = 13 // for now we have a 13 x 12 bunker
type VisualType = 'construction' | 'transform'
type MapVisualType = 'mining' | 'types'

declare global {
    interface Memory {
        visuals: {
            visualType?: MapVisualType
        }
    }

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
                map: {
                    mining: () => void
                    types: () => void
                }
                construction: (roomName: string, roads?: boolean) => void
                wallTransform: (roomName: string) => void
                tranformFromId: (roomName: string, id: Id<Source | StructureController>) => void
                sumTransform: (roomName: string) => void
                clear: (roomName: string) => void
            }
        }
    }
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
    [STRUCTURE_LAB, drawLaboratory],
    [STRUCTURE_TERMINAL, drawTerminal],
    [STRUCTURE_OBSERVER, drawObserver],
    [STRUCTURE_NUKER, drawNuker],
    [STRUCTURE_FACTORY, drawFactory],
])

function drawNumber(visual: RoomVisual, pos: RoomPosition, num: number): void {
    const color = transformColor(num)
    visual.text(num.toString(), pos.x, pos.y + 0.25, { color, font: 0.6 })
}

function transformColor(value: number): string {
    const colors = colormap({ colormap: 'cool', nshades: MAX_BUNKER_DIMENSION * 2, format: 'hex' })
    const normalizedValue = Math.max(Math.min(value * 2 - 1, MAX_BUNKER_DIMENSION * 2 - 1), 0)
    return colors[normalizedValue]
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

function drawLaboratory(visual: RoomVisual, pos: RoomPosition): void {
    visual.text('⚗️', pos.x, pos.y + 0.25, { color: 'white', font: 0.95 })
}

function drawTerminal(visual: RoomVisual, pos: RoomPosition): void {
    visual.text('🏪', pos.x, pos.y + 0.25, { color: 'white', font: 0.95 })
}

function drawObserver(visual: RoomVisual, pos: RoomPosition): void {
    visual.text('👁', pos.x, pos.y + 0.25, { color: 'white', font: 0.95 })
}

function drawNuker(visual: RoomVisual, pos: RoomPosition): void {
    visual.text('🚀', pos.x, pos.y + 0.25, { color: 'white', font: 0.95 })
}

function drawFactory(visual: RoomVisual, pos: RoomPosition): void {
    visual.text('🧪', pos.x, pos.y + 0.25, { color: 'white', font: 0.95 })
}

function hasStructureAt(structureType: StructureConstant, pos: RoomPosition) {
    const structures = pos.lookFor(LOOK_STRUCTURES)
    return filter(structures, { structureType }).length > 0
}

function hasConstructionSiteAt(structureType: BuildableStructureConstant, pos: RoomPosition) {
    const sites = pos.lookFor(LOOK_CONSTRUCTION_SITES)
    return filter(sites, { structureType }).length > 0
}

class MapVisualizer {
    static drawRoomTypes(): void {
        for (const roomName in Memory.rooms) {
            const scoutData = Memory.rooms[roomName].scout
            if (!scoutData) {
                continue
            }

            const roomType = getConstructionFeaturesV3(roomName)?.type
            const pos = new RoomPosition(25, 25, roomName)

            if (roomType === 'home') {
                Game.map.visual.text('🏠', pos, { fontSize: 5 })
            } else if (roomType === 'mine') {
                Game.map.visual.text('⛏️', pos, { fontSize: 5 })
            }
        }
    }

    static drawMiningMap(): void {
        const rooms = findMyRooms()
        for (const room of rooms) {
            if (room.memory.mines && room.memory.mines.length > 0) {
                const minerPos = new RoomPosition(25, 25, room.name)
                Game.map.visual.circle(minerPos, { radius: 3, fill: '#ffffff', opacity: 1 })
                for (const mine of room.memory.mines) {
                    const minePos = new RoomPosition(25, 25, mine.name)
                    Game.map.visual.line(minerPos, minePos, {
                        color: '#ffffff',
                        width: 1,
                        lineStyle: 'dotted',
                        opacity: 1,
                    })
                }
            }
        }
    }
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
                if (value === null || value === 0) {
                    continue
                }
                drawNumber(this.room.visual, new RoomPosition(x, y, this.room.name), value)
            }
        }
    }
}

export function visualize(): void {
    visualizeMap()
    for (const room of Object.values(Game.rooms)) {
        visualizeRoom(room)
    }
}

function visualizeRoom(room: Room): void {
    const visuals = room.memory.visuals
    if (!visuals) {
        return
    }
    const roomVisual = new RoomVisualizer(room)
    if (visuals.visualType === 'construction') {
        const constructionFeatures = getConstructionFeatures(room)
        if (!constructionFeatures) {
            Logger.info('room-visualizer:visualizeRoom:missing-features', room.name)
            return
        }
        roomVisual.renderConstructionFeatures(constructionFeatures, visuals.showRoads)
    } else if (visuals.visualType === 'transform') {
        roomVisual.renderTransform(visuals.transform as number[][])
    }
}

function visualizeMap(): void {
    const visualType = Memory.visuals?.visualType
    if (visualType === 'mining') {
        MapVisualizer.drawMiningMap()
    } else if (visualType === 'types') {
        MapVisualizer.drawRoomTypes()
    }
}

function setMiningMapVisuals(): void {
    Memory.visuals = { visualType: 'mining' }
}

function setRoomTypesMapVisuals(): void {
    Memory.visuals = { visualType: 'types' }
}

function setConstructionVisuals(roomName: string, roads = false): void {
    const room = Game.rooms[roomName]
    room.memory.visuals = { visualType: 'construction', showRoads: roads }
}

function setWallTransformVisuals(roomName: string): void {
    const room = Game.rooms[roomName]
    const wallTransform = getWallTransform(room.getTerrain(), room.name)
    room.memory.visuals = { visualType: 'transform', transform: wallTransform }
}

function setTransformFromId(roomName: string, id: Id<Source | StructureController>): void {
    const room = Game.rooms[roomName]
    const transform = getTransformFromId(room, id)
    room.memory.visuals = { visualType: 'transform', transform }
}

function setSumTransformVisuals(roomName: string): void {
    const room = Game.rooms[roomName]
    const transform = getSumTransform(room)
    room.memory.visuals = { visualType: 'transform', transform }
}

function cancelVisuals(): void {
    for (const room of Object.values(Memory.rooms)) {
        delete room.visuals
    }
    delete Memory.visuals.visualType
}

global.visuals = {
    construction: setConstructionVisuals,
    wallTransform: setWallTransformVisuals,
    tranformFromId: setTransformFromId,
    sumTransform: setSumTransformVisuals,
    clear: cancelVisuals,
    map: {
        mining: setMiningMapVisuals,
        types: setRoomTypesMapVisuals,
    },
}
