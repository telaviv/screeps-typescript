import * as Logger from '../utils/logger'
import * as Profiling from '../utils/profiling'
import * as RoomUtils from '../utils/room'
import { ConstructionFeatures, FlatRoomPosition, Position } from '../types'
import { Graph, GraphEdge, GraphVertex } from '../data-structures/graph'
import { flatten, uniqBy } from 'lodash'
import { ImmutableRoom } from 'utils/immutable-room'
import prim from '../data-structures/prim'

const SURROUNDED_BUILDING_TYPES = [
    STRUCTURE_EXTENSION,
    STRUCTURE_TOWER,
    STRUCTURE_STORAGE,
    STRUCTURE_LINK,
    STRUCTURE_CONTAINER,
]

export interface PositionEdge {
    a: string
    b: string
    weight: number
}

const posStringPairToString = (a: string, b: string): string => {
    if (a < b) {
        return `${a}:${b}`
    }
    return `${b}:${a}`
}

const positionToString = (pos: FlatRoomPosition): string => {
    return `${pos.x}:${pos.y}:${pos.roomName}`
}

const posPairToString = (a: FlatRoomPosition, b: FlatRoomPosition): string => {
    const aString = positionToString(a)
    const bString = positionToString(b)
    return posStringPairToString(aString, bString)
}

const roadSortOrder =
    (room: Room) =>
    (a: Position, b: Position): number => {
        const terrain = room.getTerrain()
        const terrainValue = (pos: Position) =>
            terrain.get(pos.x, pos.y) === TERRAIN_MASK_SWAMP ? 0 : 1
        return terrainValue(a) - terrainValue(b)
    }

export default function calculateRoadPositions(
    room: Room,
    iroom: ImmutableRoom,
    features: ConstructionFeatures,
): Position[] {
    const surroundingRoadPositions = calculateSurroundingRoadPositions(room, iroom, features)
    const roadSpinePositions = calculateRoadSpinePositions(room, iroom, features)
    const uniquePositions = uniqBy(
        [...surroundingRoadPositions, ...roadSpinePositions],
        (pos) => `${pos.x}:${pos.y}`,
    )
    uniquePositions.sort(roadSortOrder(room))
    return uniquePositions
}

export function calculateBunkerRoadPositions(
    room: Room,
    iroom: ImmutableRoom,
    features: ConstructionFeatures,
): Position[] {
    const existingRoads = iroom.getNonObstacles('road').map((structure) => structure.pos)
    const roadSpinePositions = calculateRoadSpinePositions(room, iroom, features)
    const uniquePositions = uniqBy(
        [...existingRoads, ...roadSpinePositions],
        (pos) => `${pos.x}:${pos.y}`,
    )
    uniquePositions.sort(roadSortOrder(room))
    return uniquePositions
}

function calculateSurroundingRoadPositions(
    room: Room,
    iroom: ImmutableRoom,
    features: ConstructionFeatures,
): Position[] {
    const roadPositions: Position[] = []
    const spawn = RoomUtils.getSpawns(room)
    for (const pos of spawn.map((s) => s.pos)) {
        for (const neighbor of iroom.getClosestNeighbors(pos.x, pos.y)) {
            if (iroom.isGoodRoadPosition(neighbor.x, neighbor.y)) {
                roadPositions.push(neighbor)
            }
        }
    }

    for (const structureType of SURROUNDED_BUILDING_TYPES) {
        for (const pos of features[structureType] || []) {
            for (const neighbor of iroom.getCardinalNeighbors(pos.x, pos.y)) {
                if (iroom.isGoodRoadPosition(neighbor.x, neighbor.y)) {
                    roadPositions.push(neighbor)
                }
            }
        }
    }
    return roadPositions.map((pos) => ({ x: pos.x, y: pos.y }))
}

export const calculateMinPathPositions = (
    positions: FlatRoomPosition[],
    roomCallback: (roomName: string) => CostMatrix | false,
): RoomPosition[] => {
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
            edges.push({
                a: positionToString(a),
                b: positionToString(b),
                weight,
            })
        }
    }
    const vertices = positions.map(positionToString)
    const minPosEdges = profiledMinimumSpanningTree(edges, vertices)
    return flatten(minPosEdges.map((edge) => pathMap[posStringPairToString(edge.a, edge.b)]))
}

function calculateRoadSpinePositions(
    room: Room,
    iroom: ImmutableRoom,
    features: ConstructionFeatures,
): Position[] {
    if (!features[STRUCTURE_STORAGE]) {
        Logger.error('calculateRoadSpinePositions: no storage set in features')
        throw new Error('no storage set in features')
    }

    if (!room.controller) {
        Logger.error('calculateRoadSpinePositions: no controller in room')
        throw new Error('no controller in room')
    }

    const roomCallback = (roomName: string): CostMatrix | false => {
        if (roomName !== room.name) {
            return false
        }
        const costs = new PathFinder.CostMatrix()
        for (const poss of Object.values(features)) {
            for (const pos of poss) {
                costs.set(pos.x, pos.y, 5)
            }
        }
        return costs
    }
    const controllerPos = room.controller.pos
    const storagePos = {
        ...features[STRUCTURE_STORAGE][0],
        roomName: room.name,
    }
    const sourcesPos = RoomUtils.getSources(room).map((source) => source.pos)
    const mineralsPos = RoomUtils.getMinerals(room).map((mineral) => mineral.pos)
    const positions = [controllerPos, storagePos, ...sourcesPos, ...mineralsPos]
    const flatPositions = positions.map((pos) => ({
        x: pos.x,
        y: pos.y,
        roomName: pos.roomName,
    }))
    const roadPositions = calculateMinPathPositions(flatPositions, roomCallback)
    return roadPositions
        .filter((pos) => iroom.isGoodRoadPosition(pos.x, pos.y))
        .map((pos) => ({ x: pos.x, y: pos.y }))
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
    edges.forEach((edge) => {
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
