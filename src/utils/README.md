# Utils Directory

This directory contains utility functions, helpers, and shared logic used throughout the codebase. These are organized by domain or functionality.

## Files Overview

### Core Utilities

#### globals.ts

**Purpose**: Global variable initialization.

Key features:

-   `assignGlobals()`: Sets up global state at startup
-   `findUsername()`: Detects the player's username

#### logger.ts

**Purpose**: Logging functionality for debugging and monitoring.

Key features:

-   `info()`, `warning()`, `error()`, `debug()`: Log at different levels
-   Formatted output with timestamps
-   Conditional logging based on configuration

#### profiling.ts

**Purpose**: CPU performance profiling.

Key features:

-   `wrap(fn, name)`: Wraps function with profiling
-   `@profile` decorator for class methods
-   `@mprofile(name)` decorator with custom name
-   `trackProfiler()`: Records profiling data each tick
-   Tracks CPU time spent in wrapped functions

#### ErrorMapper.ts

**Purpose**: Source map error translation.

Key features:

-   Maps minified code errors to original TypeScript line numbers
-   Wraps main loop for better error reporting
-   Essential for debugging production builds

### Room Utilities

#### room.ts

**Purpose**: Room analysis and structure queries.

Key exports:

-   Structure finders: `getExtensions()`, `getTowers()`, `getSpawns()`, `getStorage()`, `getLinks()`, `getContainers()`
-   Construction: `getConstructionSites()`, `makeConstructionSite()`
-   Walls: `hasFragileWall()`, `isFragileWall()`, `getWeakestWall()`
-   Room queries: `findMyRooms()`, `findSpawnRooms()`, `hasHostileCreeps()`
-   Room classification: `getRoomType()` returns ROOM, HIGHWAY, CENTER, or SOURCE_KEEPER
-   Structure counts: `EXTENSION_COUNTS[]`, `TOWER_COUNTS[]`, `SPAWN_COUNTS[]` by RCL

#### room-position.ts

**Purpose**: RoomPosition utility functions.

Key features:

-   `getNeighbors(pos)`: Get 8 adjacent positions
-   `getNonObstacleNeighbors(pos)`: Get walkable adjacent positions
-   `getContainerAt(pos)`: Find container at position
-   Position comparison and validation

### Creep Utilities

#### creep.ts

**Purpose**: Creep-related utility functions.

Key features:

-   `getCreeps(role, room?)`: Find creeps by role
-   `getLogisticsCreeps(opts)`: Find logistics creeps with filters
-   `moveToStationaryPoint(pos, creep)`: Move to designated position
-   `wander(creep)`: Random movement for idle creeps

#### parts.ts

**Purpose**: Creep body part calculations.

Key features:

-   `fromBodyPlan(capacity, plan)`: Generate body from energy capacity
-   `fromBodyPlanSafe(capacity, plan)`: Safe version returning null on failure
-   `planCost(parts)`: Calculate spawn cost for body
-   `byPartCount(plan)`: Convert plan object to parts array

#### spawn.ts

**Purpose**: Spawn management utilities.

Key features:

-   `spawnCreep(spawn, parts, name, home, opts)`: Unified spawn function
-   Name generation with role and room prefix
-   Memory initialization for new creeps

### Energy Utilities

#### energy-harvesting.ts

**Purpose**: Energy state checking functions.

Key features:

-   `hasNoEnergy(creep)`: Check if creep has no energy
-   `isFullOfEnergy(creep)`: Check if creep is at capacity
-   Used by roles to determine task switching

#### store.ts

**Purpose**: Store/inventory utilities.

Key features:

-   Helpers for checking store capacity
-   Resource amount calculations

#### virtual-storage.ts

**Purpose**: Virtual storage abstraction.

Key features:

-   Tracks expected storage contents
-   Accounts for in-transit energy

### Movement Utilities

#### travel.ts

**Purpose**: Pathfinding and movement functions.

Key features:

-   `moveToRoom(creep, roomName)`: Inter-room travel
-   `moveWithinRoom(creep, target, opts)`: Intra-room movement
-   Path caching and optimization
-   Stuck detection and resolution

### Data Structures

#### time-cache.ts

**Purpose**: Time-based cache with TTL.

Key features:

-   Caches values that expire after N ticks
-   `TimeCache.get(key)`, `TimeCache.set(key, value, ttl)`
-   `TimeCache.clearAll()`: Clear all caches

#### sliding-window.ts

**Purpose**: Sliding window data structure.

Key features:

-   Tracks values over a window of ticks
-   Used for rate calculations and averaging

#### roomPositionSet.ts

**Purpose**: Efficient set for RoomPosition objects.

Key features:

-   Set operations for RoomPosition
-   Handles position serialization

### Other Utilities

#### stats.ts

**Purpose**: Game statistics tracking.

Key features:

-   `recordGameStats()`: Record empire-wide stats
-   `recordRoomStats(room)`: Record per-room stats
-   Tracks CPU, energy, creep counts, etc.

#### flags.ts

**Purpose**: Flag management utilities.

Key features:

-   Flag creation and removal helpers
-   Flag color interpretation

#### hash.ts

**Purpose**: Hashing utilities.

Key features:

-   Position hashing for maps
-   String hashing functions

#### world.ts

**Purpose**: World/map navigation utilities.

Key features:

-   `World` class for room distance calculations
-   `getClosestRooms(origins, maxDistance)`: Find nearby rooms
-   `getClosestRoom(origin, targets, maxDistance)`: Find nearest room
-   Room exit and neighbor calculations

#### autoincrement.ts

**Purpose**: Auto-incrementing ID generator.

Key features:

-   `autoIncrement()`: Get next unique ID
-   Used for task and entity IDs

#### utilities.ts

**Purpose**: General-purpose utilities.

Key features:

-   `randomElement(array)`: Random array element
-   Other generic helpers

#### pokemon.ts

**Purpose**: Pokemon-related utilities.

Key features:

-   Fun naming or features (context-specific)

#### position.ts

**Purpose**: Position utilities.

Key features:

-   Position serialization and comparison
-   Distance calculations

## Usage Patterns

### Import Style

```typescript
import * as Logger from 'utils/logger'
import { getExtensions, hasHostileCreeps } from 'utils/room'
import { wrap } from 'utils/profiling'
```

### Profiling Decorators

```typescript
class MyClass {
    @profile
    public myMethod(): void {
        // Method will be profiled
    }
}
```

### Room Queries

```typescript
const extensions = getExtensions(room)
const storage = getStorage(room)
if (hasHostileCreeps(room)) {
    // Handle threat
}
```

## Test Files

-   **energy-harvesting.spec.ts**: Unit tests for energy harvesting utilities
