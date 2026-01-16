# Data Structures Directory

This directory contains graph algorithms and data structures used for room analysis, pathfinding, and layout optimization.

## Files Overview

### graph.ts

**Purpose**: Graph data structure implementation with vertices and edges.

#### Graph Class

Represents a graph structure (directed or undirected).

```typescript
class Graph {
    constructor(directed: boolean)

    addVertex(vertex: GraphVertex): Graph
    addEdge(edge: GraphEdge): Graph
    getVertex(vertex: GraphVertex): GraphVertex
    getVertices(): GraphVertex[]
    getEdges(): GraphEdge[]
    getNeighbors(vertex: GraphVertex): GraphVertex[]
    findEdge(start: GraphVertex, end: GraphVertex): GraphEdge | null
    isDirected(): boolean
    toString(): string
}
```

Key features:

-   Supports both directed and undirected graphs
-   Vertex lookup by key
-   Edge retrieval with deduplication
-   Neighbor traversal

#### GraphVertex Class

Represents a node in the graph.

```typescript
class GraphVertex {
    public key: string

    constructor(key: string)

    getKey(): string
    addEdge(edge: GraphEdge): GraphVertex
    findEdge(vertex: GraphVertex): GraphEdge
    getNeighbors(): GraphVertex[]
    getEdges(): GraphEdge[]
}
```

Key features:

-   String-based key identification
-   Edge list management
-   Neighbor access through edges

#### GraphEdge Class

Represents a connection between two vertices.

```typescript
class GraphEdge {
    startVertex: GraphVertex
    endVertex: GraphVertex
    weight: number

    constructor(startVertex: GraphVertex, endVertex: GraphVertex, weight = 0)
}
```

Key features:

-   Weighted edges (default weight: 0)
-   Start and end vertex references

### prim.ts

**Purpose**: Prim's algorithm for Minimum Spanning Tree (MST).

Key features:

-   Finds minimum spanning tree of a weighted graph
-   Used for road placement optimization
-   Connects important room positions with minimal road length

```typescript
function prim(graph: Graph): GraphEdge[]
```

Usage in Screeps:

-   Input: Graph of room positions to connect (sources, controller, spawns)
-   Output: Minimum set of edges representing optimal road paths
-   Reduces road construction costs while maintaining connectivity

### comparator.ts

**Purpose**: Comparison utilities for sorting and priority queues.

Key features:

-   Generic comparator functions
-   Used by graph algorithms for edge weight comparison
-   Priority queue support for Prim's algorithm

## Use Cases

### Road Optimization

```typescript
// Create graph of key positions
const graph = new Graph(false) // undirected

// Add vertices for sources, controller, storage
const sourceVertex = new GraphVertex('source1')
const controllerVertex = new GraphVertex('controller')
graph.addVertex(sourceVertex)
graph.addVertex(controllerVertex)

// Add weighted edges based on distance
const edge = new GraphEdge(sourceVertex, controllerVertex, distance)
graph.addEdge(edge)

// Find minimum spanning tree for roads
const mstEdges = prim(graph)
```

### Room Layout Analysis

-   Vertices represent room positions
-   Edges represent possible connections
-   Weights represent path costs or distances
-   MST provides optimal connection strategy

## Algorithm Complexity

### Graph Operations

-   `addVertex()`: O(1)
-   `addEdge()`: O(1)
-   `getVertex()`: O(1)
-   `getEdges()`: O(V + E) where V = vertices, E = edges
-   `getNeighbors()`: O(degree of vertex)

### Prim's Algorithm

-   Time: O(E log V) with priority queue
-   Space: O(V + E)

## Integration

These data structures integrate with:

-   **room-analysis/**: For distance calculations
-   **construction-features.ts**: For road placement planning
-   **stamps/**: For bunker layout optimization
