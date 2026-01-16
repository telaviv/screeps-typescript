# Room Analysis Directory

This directory contains algorithms for analyzing room layouts, calculating distances, and optimizing structure placement.

## Files Overview

### distance-transform.ts

**Purpose**: Distance transform algorithms for room analysis.

#### Core Functions

##### distanceTransform

Calculates distance from positions to all other positions in the room:

```typescript
function distanceTransform(roomTerrain: RoomTerrain, positions: Position[]): number[][]
```

Returns a 50x50 matrix where each cell contains the distance to the nearest position in the input array. Walls are marked as `Infinity`.

##### getWallTransform

Calculates distance from walls/room edges:

```typescript
function getWallTransform(roomTerrain: RoomTerrain, roomName: string): number[][]
```

Used to find open areas for base placement - higher values indicate positions farther from walls.

##### getTransformFromId

Calculates distance transform from a specific game object:

```typescript
function getTransformFromId(room: Room, id: Id<Source | StructureController>): number[][]
```

##### getSumTransform

Combines distance transforms from all sources and controller:

```typescript
function getSumTransform(room: Room): number[][]
```

Returns matrix where each cell contains sum of distances to all key positions. Lower values indicate positions closer to all important locations - ideal for central base placement.

##### sumTransformsFromPositions

Combines multiple distance transforms:

```typescript
function sumTransformsFromPositions(roomTerrain: RoomTerrain, positions: Position[]): number[][]
```

##### getPositionsFromTransform

Extracts positions meeting a threshold:

```typescript
function getPositionsFromTransform(transform: number[][], minNumber: number): Position[]
```

### calculate-road-positions.ts

**Purpose**: Road placement calculation.

Key features:

-   Calculates optimal road paths between structures
-   Uses pathfinding to connect key positions
-   Integrates with stamp system for road layout

## Algorithm Details

### Distance Transform (BFS)

The distance transform uses Breadth-First Search:

1. Initialize all cells to `Infinity`
2. Set source positions to `0` and add to queue
3. Process queue: for each position, set unvisited neighbors to `current + 1`
4. Skip wall terrain (remains `Infinity`)
5. Continue until queue is empty

Complexity: O(50 \* 50) = O(2500) per transform

### Finding Base Placement

```typescript
// Get distance from walls (open areas)
const wallTransform = getWallTransform(terrain, roomName)

// Find positions at least N tiles from walls
const openPositions = getPositionsFromTransform(wallTransform, 5)

// Get sum distance to sources and controller
const sumTransform = getSumTransform(room)

// Best position: far from walls AND close to key objects
// (high wall distance + low sum distance)
```

## Use Cases

### Bunker Placement

```typescript
const wallTransform = getWallTransform(room.getTerrain(), room.name)
const sumTransform = getSumTransform(room)

// Find positions with enough open space
const candidates = getPositionsFromTransform(wallTransform, 6)

// Score by centrality
candidates.sort((a, b) => sumTransform[a.x][a.y] - sumTransform[b.x][b.y])

const bestPosition = candidates[0]
```

### Road Planning

```typescript
// Calculate distances from each source
const sourceTransforms = sources.map((s) => getTransformFromId(room, s.id))

// Find positions on shortest paths
// (used by calculate-road-positions.ts)
```

### Defense Analysis

```typescript
// Distance from room edges
const edgeTransform = getWallTransform(terrain, roomName)

// Positions close to edges are vulnerable
const vulnerablePositions = getPositionsFromTransform(edgeTransform, 0).filter(
    (p) => edgeTransform[p.x][p.y] < 3,
)
```

## Integration

Room analysis integrates with:

-   **construction-features.ts**: Base placement decisions
-   **stamps/**: Validating stamp placement
-   **data-structures/**: Graph-based road optimization
-   **managers/build-manager.ts**: Construction site placement

## Performance Notes

-   Transform calculations are O(n) where n = room size (2500)
-   Results should be cached when possible
-   `getSumTransform` runs multiple transforms - use sparingly
-   Room terrain is constant - cache terrain-only transforms
