import PriorityQueue from 'ts-priority-queue'

import { ConstructionFeatures } from '../construction-features'
import { Position, RoadGraph, RoadGraphNode, RoadGraphObstacleEntry } from 'types'

function posKey(x: number, y: number): string {
    return `${x},${y}`
}

export function buildRoadGraph(features: ConstructionFeatures): RoadGraph {
    const roads = features[STRUCTURE_ROAD] ?? []

    const roadSet = new Set<string>(roads.map((p) => posKey(p.x, p.y)))

    // Build forward map: "x,y" -> structure types at that position (excluding roads)
    const structureMap = new Map<string, BuildableStructureConstant[]>()
    for (const [structureType, positions] of Object.entries(features) as [
        BuildableStructureConstant,
        Position[] | undefined,
    ][]) {
        if (structureType === STRUCTURE_ROAD || !positions) continue
        for (const pos of positions) {
            const key = posKey(pos.x, pos.y)
            const existing = structureMap.get(key)
            if (existing) {
                if (!existing.includes(structureType)) {
                    existing.push(structureType)
                }
            } else {
                structureMap.set(key, [structureType])
            }
        }
    }

    const nodes: { [key: string]: RoadGraphNode } = {}
    const obstacles: { [posKey: string]: RoadGraphObstacleEntry } = {}

    for (const road of roads) {
        const key = posKey(road.x, road.y)
        const neighbors: string[] = []
        const structures: BuildableStructureConstant[] = []

        for (let dx = -1; dx <= 1; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
                if (dx === 0 && dy === 0) continue
                const nx = road.x + dx
                const ny = road.y + dy
                const neighborKey = posKey(nx, ny)

                if (roadSet.has(neighborKey)) {
                    neighbors.push(neighborKey)
                }

                const adjacentStructures = structureMap.get(neighborKey)
                if (adjacentStructures) {
                    for (const structureType of adjacentStructures) {
                        if (!structures.includes(structureType)) {
                            structures.push(structureType)
                        }
                    }

                    if (!obstacles[neighborKey]) {
                        obstacles[neighborKey] = { type: adjacentStructures[0], roads: [] }
                    }
                    if (!obstacles[neighborKey].roads.includes(key)) {
                        obstacles[neighborKey].roads.push(key)
                    }
                }
            }
        }

        nodes[key] = { x: road.x, y: road.y, structures, neighbors }
    }

    return { nodes, obstacles }
}

interface QueueEntry {
    key: string
    priority: number
}

export function astar(
    graph: RoadGraph,
    startKey: string,
    targetKeys: Set<string>,
): string[] | null {
    if (targetKeys.size === 0) return null
    if (!graph.nodes[startKey]) return null

    if (targetKeys.has(startKey)) return [startKey]

    const validTargets = Array.from(targetKeys)
        .filter((k) => graph.nodes[k])
        .map((k) => graph.nodes[k])

    if (validTargets.length === 0) return null

    function h(key: string): number {
        const node = graph.nodes[key]
        if (!node) return Infinity
        let min = Infinity
        for (const t of validTargets) {
            const dist = Math.max(Math.abs(node.x - t.x), Math.abs(node.y - t.y))
            if (dist < min) min = dist
        }
        return min
    }

    const distances: { [key: string]: number } = { [startKey]: 0 }
    const cameFrom: { [key: string]: string } = {}
    const visited = new Set<string>()

    const pq = new PriorityQueue<QueueEntry>({
        comparator: (a, b) => a.priority - b.priority,
    })
    pq.queue({ key: startKey, priority: h(startKey) })

    while (pq.length > 0) {
        const { key: curKey } = pq.dequeue()

        if (visited.has(curKey)) continue
        visited.add(curKey)

        if (targetKeys.has(curKey)) {
            const path: string[] = []
            let current = curKey
            while (current !== startKey) {
                path.push(current)
                current = cameFrom[current]
            }
            path.push(startKey)
            return path.reverse()
        }

        const curNode = graph.nodes[curKey]
        if (!curNode) continue

        for (const neighborKey of curNode.neighbors) {
            if (visited.has(neighborKey)) continue
            const newDist = distances[curKey] + 1
            if (distances[neighborKey] === undefined || newDist < distances[neighborKey]) {
                distances[neighborKey] = newDist
                cameFrom[neighborKey] = curKey
                pq.queue({ key: neighborKey, priority: newDist + h(neighborKey) })
            }
        }
    }

    return null
}

export function findPathOnRoadGraph(
    graph: RoadGraph,
    start: Position,
    targetType: BuildableStructureConstant,
): Position[] | null {
    const nodes = graph.nodes

    const startExact = posKey(start.x, start.y)
    let startKey: string

    if (nodes[startExact]) {
        startKey = startExact
    } else {
        let minDist = Infinity
        let nearest: string | null = null
        for (const key of Object.keys(nodes)) {
            const node = nodes[key]
            const dist = Math.max(Math.abs(node.x - start.x), Math.abs(node.y - start.y))
            if (dist < minDist) {
                minDist = dist
                nearest = key
            }
        }
        if (!nearest) return null
        startKey = nearest
    }

    const targetKeys = new Set(
        Object.keys(nodes).filter((k) => nodes[k].structures.includes(targetType)),
    )

    const keyPath = astar(graph, startKey, targetKeys)
    if (!keyPath) return null

    return keyPath.map((k) => {
        const node = nodes[k]
        return { x: node.x, y: node.y }
    })
}
