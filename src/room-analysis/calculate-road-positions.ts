import * as RoomUtils from '../utils/room'
import { ConstructionFeatures, FlatRoomPosition, Position } from '../types'
import { flatten } from 'lodash'
import prim from '../data-structures/prim'
import { Graph, GraphEdge, GraphVertex } from '../data-structures/graph'
import * as Profiling from '../utils/profiling'


export type PositionEdge = {
    a: string
    b: string
    weight: number
}

export default function calculateRoadPositions(room: Room, features: ConstructionFeatures): Position[] {
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
