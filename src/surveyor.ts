/* eslint @typescript-eslint/no-unused-vars: ['off'] */
import { minCutWalls } from 'screeps-min-cut-wall'
import { Graph, GraphEdge, GraphVertex } from 'data-structures/graph'
import prim from 'data-structures/prim'

import RoomPlanner from 'room-planner'
import { ImmutableRoom, fromRoom } from 'utils/immutable-room'
import * as RoomUtils from 'utils/room'
import { each, flatten } from 'lodash'
import * as Logger from 'utils/logger'
import * as Profiling from 'utils/profiling'
import { FlatRoomPosition, Position } from 'types';

type ConstructionFeatures = {
    [K in BuildableStructureConstant]?: Position[]
}

declare global {
    interface RoomMemory {
        constructionFeatures?: ConstructionFeatures;
    }

    namespace NodeJS {
        interface Global {
            clearConstructionFeatures(roomName: string): void;
        }
    }
}

global.clearConstructionFeatures = clearConstructionFeatures

function clearConstructionFeatures(roomName: string) {
    Memory.rooms[roomName].constructionFeatures = undefined
}

function saveConstructionFeatures(room: Room) {
    if (!room.memory.constructionFeatures) {
        const features = calculateConstructionFeatures(room)
        room.memory.constructionFeatures = features
    }
}

export function getConstructionFeatures(room: Room): ConstructionFeatures {
    return room.memory.constructionFeatures!;
}

const getSpawn = (room: Room): StructureSpawn => {
    return room.find(FIND_MY_SPAWNS)[0]
}

function assignSources(roomPlanner: RoomPlanner) {
    const room = roomPlanner.room
    const sources = room.find(FIND_SOURCES)
    const spawn = getSpawn(room)
    if (!spawn) {
        return
    }

    room.memory.sources = []
    for (const source of sources) {
        const path = PathFinder.search(
            spawn.pos,
            { pos: source.pos, range: 1 },
            { swampCost: 1 },
        ).path
        const pos = path[path.length - 1]
        const ppos = path[path.length - 2]
        room.memory.sources.push({
            id: source.id,
            dropSpot: {
                pos,
            },
        })
        const linkSpot = getLinkSpot(pos, ppos)
        roomPlanner.setSourceLink(source.id, linkSpot)
    }
}

function getLinkSpot(pos: RoomPosition, ignore?: RoomPosition): RoomPosition {
    const room = Game.rooms[pos.roomName]
    const iroom = fromRoom(room)
    const neighbors = iroom.getClosestNeighbors(pos.x, pos.y)
    let linkSpots = neighbors.filter((npos) => !npos.isObstacle())

    if (ignore) {
        linkSpots = linkSpots.filter(
            (npos) => !(npos.x === ignore.x && npos.y === ignore.y),
        )
    }
    if (linkSpots.length === 0) {
        Logger.debug('surveyor:getLinkSpot:failure', pos, neighbors)
        throw new Error(
            `Couldn't find a link spot (${pos.x}, ${pos.y}, ${pos.roomName})`,
        )
    }
    const linkSpot = linkSpots[Math.floor(Math.random() * linkSpots.length)]
    return new RoomPosition(linkSpot.x, linkSpot.y, pos.roomName)
}

function planRoom(room: Room) {
    Logger.info('surveyor:planRoom', room.name)
    const roomPlanner = new RoomPlanner(room)
    assignSources(roomPlanner)
    const iroom = fromRoom(room)
    const storageiPos = iroom.nextStoragePos()
    const storagePos = new RoomPosition(storageiPos.x, storageiPos.y, room.name)
    const linkSpot = getLinkSpot(storagePos)
    const controllerLink = iroom.controllerLinkPos()

    roomPlanner.setStoragePosition(storagePos)
    roomPlanner.setStorageLink(linkSpot)
    roomPlanner.setControllerLink(controllerLink)


    if (!roomPlanner.planIsFinished()) {
        throw new Error(`somehow didn't finish the plan for ${room.name}`)
    }
}

function calculateConstructionFeatures(room: Room): ConstructionFeatures {
    let iroom: ImmutableRoom = fromRoom(room)
    iroom = iroom.setStorage()
    iroom = iroom.setSourceContainers()
    iroom = iroom.setStorageLink()
    iroom = iroom.setSourceContainerLinks()
    iroom = iroom.setControllerLink()
    iroom = iroom.setExtensions()
    iroom = iroom.setTowers()

    const features = {
        [STRUCTURE_EXTENSION]: iroom.sortedExtensionPositions(),
        [STRUCTURE_TOWER]: iroom.sortedTowerPositions(),
        [STRUCTURE_STORAGE]: iroom.getObstacles('storage').map((pos) => ({ x: pos.x, y: pos.y })),
        [STRUCTURE_LINK]: iroom.sortedLinkPositions(),
        [STRUCTURE_CONTAINER]: iroom.getNonObstacles('container').map((pos) => ({ x: pos.x, y: pos.y })),
        [STRUCTURE_RAMPART]: [] as Position[],
        [STRUCTURE_ROAD]: [] as Position[],
    }
    const positions = (Object.values(features) as Position[][]).reduce(
        (acc: Position[], val: Position[]) => acc.concat(val), [] as Position[])
    features[STRUCTURE_RAMPART] = getRampartPositions(room, positions)
    features[STRUCTURE_ROAD] = getRoadPositions(room, features)
    return features
}

function getRampartPositions(room: Room, features: Position[]): Position[] {
    type Position = [number, number]
    const isCenter = (pos: Position): boolean => {
        return features.some((feature) => feature.x === pos[0] && feature.y === pos[1])
    }
    const isWall = (pos: Position): boolean => {
        return room.getTerrain().get(pos[0], pos[1]) === TERRAIN_MASK_WALL
    }
    const positions = minCutWalls({ isCenter, isWall })
    return positions.map((pos) => ({ x: pos[0], y: pos[1] }))
}

const assignRoomFeatures = Profiling.wrap(() => {
    each(Game.rooms, (room: Room) => {
        if (room.controller && room.controller.my && !RoomUtils.hasNoSpawns(room)) {
            saveConstructionFeatures(room)
            const roomPlanner = new RoomPlanner(room)
            if (!roomPlanner.planIsFinished()) {
                planRoom(room)
            }
        }
    })
}, 'assignRoomFeatures')

export type PositionEdge = {
    a: string
    b: string
    weight: number
}


function getRoadPositions(room: Room, features: ConstructionFeatures): Position[] {
    const roomCallback = (roomName: string): CostMatrix | false => {
        if (roomName !== room.name) {
            return false
        }
        const costs = new PathFinder.CostMatrix()
        for (const positions of Object.values(features)) {
            for (const pos of positions) {
                costs.set(pos.x, pos.y, 5)
            }
        }
        return costs
    }
    const controllerPos = room.controller!.pos
    const storagePos = { ...features[STRUCTURE_STORAGE]![0], roomName: room.name }
    const sourcesPos = RoomUtils.getSources(room).map((source) => source.pos)
    const mineralsPos = RoomUtils.getMinerals(room).map((mineral) => mineral.pos)
    const positions = [controllerPos, storagePos, ...sourcesPos, ...mineralsPos]
    const flatPositions = positions.map((pos) => ({ x: pos.x, y: pos.y, roomName: pos.roomName }))
    const roadPositions = calculateMinPathPositions(flatPositions, roomCallback)
    return roadPositions.map((pos) => ({ x: pos.x, y: pos.y }))
}

export const calculateMinPathPositions = (
    positions: FlatRoomPosition[],
    roomCallback: (roomName: string) => CostMatrix | false): RoomPosition[] => {

    const pathMap: { [key: string]: RoomPosition[] } = {}
    const edges: PositionEdge[] = []
    for (let i = 0; i < positions.length; i++) {
        for (let j = i + 1; j < positions.length; j++) {
            const a = positions[i]
            const b = positions[j]
            const solution = PathFinder.search(
                new RoomPosition(a.x, a.y, a.roomName),
                { pos: new RoomPosition(b.x, b.y, b.roomName), range: 1 },
                { swampCost: 1, roomCallback },
            )
            const weight = solution.cost
            pathMap[posPairToString(a, b)] = solution.path
            edges.push({ a: positionToString(a), b: positionToString(b), weight })
        }
    }
    const vertices = positions.map(positionToString)
    const minPosEdges = profiledMinimumSpanningTree(edges, vertices)
    return flatten(minPosEdges.map((edge) => pathMap[posStringPairToString(edge.a, edge.b)]))
}

const posStringPairToString = (a: string, b: string): string => {
    if (a < b) {
        return `${a}:${b}`
    }
    return `${b}:${a}`
}

const posPairToString = (a: FlatRoomPosition, b: FlatRoomPosition): string => {
    const aString = positionToString(a)
    const bString = positionToString(b)
    return posStringPairToString(aString, bString)
}

const positionToString = (pos: FlatRoomPosition): string => {
    return `${pos.x}:${pos.y}:${pos.roomName}`
}

export const minimumSpanningTree = (edges: PositionEdge[], vertices: string[]): PositionEdge[] => {
    const graph = createGraph(edges, vertices)
    const mst = prim(graph)
    const minPosEdge: PositionEdge[] = []
    for (const minEdge of mst.getEdges()) {
        const a = minEdge.startVertex.key
        const b = minEdge.endVertex.key
        minPosEdge.push({ a, b, weight: minEdge.weight })
    }
    return minPosEdge
}

const profiledMinimumSpanningTree = Profiling.wrap(minimumSpanningTree, 'minimumSpanningTree')

const createGraph = (edges: PositionEdge[], vertices: string[]): Graph => {
    const graph = new Graph(false)
    const graphVertices = vertices.map((vertex) => new GraphVertex(vertex))
    const graphEdges = edges.map((edge) => {
        const aVertex = graphVertices.find((vertex) => vertex.key === edge.a)
        const bVertex = graphVertices.find((vertex) => vertex.key === edge.b)
        if (!aVertex || !bVertex) {
            throw new Error('vertex not found')
        }
        const graphEdge = new GraphEdge(aVertex, bVertex, edge.weight)
        graph.addEdge(graphEdge)
    })
    return graph
}

const survey = () => {
    assignRoomFeatures();
}

export default survey;
