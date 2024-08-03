import * as Profiling from '../utils/profiling'
import { ConstructionFeatures, FlatRoomPosition, isObstacle, Position } from '../types'
import { Graph, GraphEdge, GraphVertex } from '../data-structures/graph'
import { flatten, uniqBy } from 'lodash'
import { ImmutableRoom } from 'utils/immutable-room'
import { MatrixCacheManager } from 'matrix-cache'
import prim from '../data-structures/prim'

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
    (roomName: string) =>
    (a: Position, b: Position): number => {
        const terrain = new Room.Terrain(roomName)
        const terrainValue = (pos: Position) =>
            terrain.get(pos.x, pos.y) === TERRAIN_MASK_SWAMP ? 0 : 1
        return terrainValue(a) - terrainValue(b)
    }

export function calculateBunkerRoadPositions(
    roomName: string,
    iroom: ImmutableRoom,
    features: ConstructionFeatures,
): Position[] {
    const existingRoads = iroom.getNonObstacles('road').map((structure) => structure.pos)
    const roadSpinePositions = calculateRoadSpinePositions(roomName, iroom, features)
    const uniquePositions = uniqBy(
        [...existingRoads, ...roadSpinePositions],
        (pos) => `${pos.x}:${pos.y}`,
    )
    uniquePositions.sort(roadSortOrder(roomName))
    return uniquePositions
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
    roomName: string,
    iroom: ImmutableRoom,
    features: ConstructionFeatures,
): Position[] {
    const stationaryPoints = iroom.stationaryPoints
    if (
        !stationaryPoints ||
        !stationaryPoints.controllerLink ||
        !stationaryPoints.storageLink ||
        !iroom.stationaryPoints.sources
    ) {
        throw new Error('incomplete stationary points')
    }
    const points = [
        iroom.stationaryPoints.controllerLink as Position,
        iroom.stationaryPoints.storageLink as Position,
        ...Object.values(iroom.stationaryPoints.sources),
    ]
    const roomCallback = (rn: string): CostMatrix | false => {
        if (roomName !== rn) {
            return false
        }
        const matrix = MatrixCacheManager.getDefaultCostMatrix(roomName).clone()
        for (const [type, positions] of Object.entries(features)) {
            if (!isObstacle(type)) {
                continue
            }
            for (const pos of positions) {
                matrix.set(pos.x, pos.y, 255)
            }
        }
        return matrix
    }

    const roadPositions = calculateMinPathPositions(
        points.map((p) => new RoomPosition(p.x, p.y, roomName)),
        roomCallback,
    )
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
