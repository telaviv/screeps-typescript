# Stamps Directory

This directory contains building layout templates ("stamps") that define pre-planned base configurations. Stamps specify where structures should be placed relative to a central position.

## Files Overview

### bunker.ts

**Purpose**: Main bunker base layout template.

The bunker stamp defines a compact, defensible base layout for RCL 8 rooms:

```typescript
export default {
    rcl: 8,
    stationaryPoints: {
        storageLink: { x: 22, y: 16 },
    },
    buildings: {
        spawn: [
            /* 3 positions */
        ],
        link: [
            /* 1 position */
        ],
        storage: [
            /* 1 position */
        ],
        terminal: [
            /* 1 position */
        ],
        tower: [
            /* 6 positions */
        ],
        nuker: [
            /* 1 position */
        ],
        lab: [
            /* 10 positions */
        ],
        road: [
            /* many positions */
        ],
        factory: [
            /* 1 position */
        ],
        extension: [
            /* 60 positions */
        ],
        observer: [
            /* 1 position */
        ],
    },
} as Stamp
```

Structure placement:

-   **Spawns**: Central cluster (3 spawns for RCL 8)
-   **Storage/Terminal**: Core area for easy logistics access
-   **Towers**: Distributed for defense coverage
-   **Labs**: Grouped for reaction chains
-   **Extensions**: Fill remaining space efficiently
-   **Roads**: Connect all structures for fast movement

### types.ts

**Purpose**: Stamp type definitions.

```typescript
interface Stamp {
    rcl: number // Required RCL for full build
    stationaryPoints?: {
        // Special positions
        storageLink?: Position
        // Other named positions
    }
    buildings: {
        [structureType: string]: Position[] // Structure positions
    }
}

interface Position {
    x: number
    y: number
}
```

### utils.ts

**Purpose**: Stamp utility functions.

Key features:

-   Stamp placement calculations
-   Position translation (stamp coords to room coords)
-   Collision detection with terrain
-   Stamp rotation/mirroring (if implemented)

## Stamp Concepts

### Coordinate System

Stamp positions are relative coordinates centered around a placement point. When applying a stamp to a room:

1. Find optimal placement position
2. Translate stamp coordinates to room coordinates
3. Account for terrain obstacles

### Structure Priorities

Structures are typically built in order:

1. **Essential**: Spawns, storage, extensions
2. **Defense**: Towers, ramparts, walls
3. **Economy**: Links, terminal, labs
4. **Luxury**: Observer, nuker, power spawn

### Stationary Points

Special positions where creeps should stand:

-   `storageLink`: Position for static link hauler
-   Source positions: Where harvesters stand

## Usage

### Applying a Stamp

```typescript
import bunker from 'stamps/bunker'

// Translate stamp positions to room coordinates
function applyStamp(stamp: Stamp, origin: Position, room: Room) {
    for (const [structureType, positions] of Object.entries(stamp.buildings)) {
        for (const pos of positions) {
            const roomPos = new RoomPosition(
                origin.x + pos.x - 22, // Offset from stamp center
                origin.y + pos.y - 16,
                room.name,
            )
            room.createConstructionSite(roomPos, structureType)
        }
    }
}
```

### Finding Placement

```typescript
// Use room-analysis to find best bunker position
const transform = getSumTransform(room)
const candidates = getPositionsFromTransform(transform, minDistance)
// Select position with best terrain fit
```

## Integration

Stamps integrate with:

-   **construction-features.ts**: Uses stamps for room planning
-   **room-analysis/**: Distance transform for placement finding
-   **managers/build-manager.ts**: Creates construction sites from stamps
-   **data-structures/**: Graph algorithms for road optimization
