import { Graph, GraphEdge, GraphVertex } from './graph'
import PriorityQueue from 'ts-priority-queue'

/**
 * @param {Graph} graph
 * @return {Graph}
 */
export default function prim(graph: Graph): Graph {
    // It should fire error if graph is directed since the algorithm works only
    // for undirected graphs.
    if (graph.isDirected()) {
        throw new Error("Prim's algorithms works only for undirected graphs")
    }

    // Init new graph that will contain minimum spanning tree of original graph.
    const minimumSpanningTree = new Graph(false)

    // This priority queue will contain all the edges that are starting from
    // visited nodes and they will be ranked by edge weight - so that on each step
    // we would always pick the edge with minimal edge weight.
    const edgesQueue = new PriorityQueue({
        comparator: (a: GraphEdge, b: GraphEdge) => a.weight - b.weight,
    })

    // Set of vertices that has been already visited.
    const visitedVertices: Set<string> = new Set()

    // Vertex from which we will start graph traversal.
    const startVertex = graph.getVertices()[0]

    // Add start vertex to the set of visited ones.
    visitedVertices.add(startVertex.key)

    // Add all edges of start vertex to the queue.
    startVertex.getEdges().forEach((graphEdge) => {
        if (graphEdge.startVertex === startVertex || graphEdge.endVertex === startVertex) {
            edgesQueue.queue(graphEdge)
        }
    })

    // Now let's explore all queued edges.
    while (!(edgesQueue.length === 0)) {
        // Fetch next queued edge with minimal weight.
        /** @var {GraphEdge} currentEdge */
        const currentMinEdge = edgesQueue.dequeue()

        // Find out the next unvisited minimal vertex to traverse.
        let nextMinVertex = null
        if (!visitedVertices.has(currentMinEdge.startVertex.key)) {
            nextMinVertex = currentMinEdge.startVertex
        } else if (!visitedVertices.has(currentMinEdge.endVertex.key)) {
            nextMinVertex = currentMinEdge.endVertex
        }

        // If all vertices of current edge has been already visited then skip this round.
        if (nextMinVertex) {
            // Add current min edge to MST.
            const a = new GraphVertex(currentMinEdge.startVertex.key)
            const b = new GraphVertex(currentMinEdge.endVertex.key)
            const edge = new GraphEdge(a, b, currentMinEdge.weight)
            minimumSpanningTree.addEdge(edge)

            // Add vertex to the set of visited ones.
            visitedVertices.add(nextMinVertex.key)

            // Add all current vertex's edges to the queue.
            nextMinVertex.getEdges().forEach((graphEdge: GraphEdge) => {
                // Add only vertices that link to unvisited nodes.
                if (
                    !visitedVertices.has(graphEdge.startVertex.key) ||
                    !visitedVertices.has(graphEdge.endVertex.key)
                ) {
                    edgesQueue.queue(graphEdge)
                }
            })
        }
    }

    return minimumSpanningTree
}
