# Managers Directory

This directory contains manager classes that coordinate various game systems. Managers handle high-level logic for specific aspects of the game, abstracting complexity from the main game loop.

## Files Overview

### room-manager.ts

**Purpose**: Manages room-level tasks like claiming and scouting.

Key features:

-   `RoomManager` class for managing a single room's task queue
-   `RoomTask` interface: tasks have id, type, data, and timestamp
-   Task types: `claim`, `long-distance-mine`, `scout`
-   `addClaimRoomTask(room)`: Queue a room for claiming
-   `addScoutRoomTask(room)`: Queue a room for scouting
-   `claimRoom()`: Execute claim task via WarDepartment
-   `scoutRoom()`: Execute scout task by spawning scout creep
-   Static methods for aggregating tasks across all rooms

### mine-manager.ts

**Purpose**: Manages remote mining operations from adjacent rooms.

Key features:

-   `MineManager` class for individual mine management
-   `MineDecider` class assigns mines to nearest owned rooms
-   `Mine` interface tracks mine state (hauler count, capacity, timestamps)
-   Checks: vision, reservation status, harvester/hauler/builder needs
-   `needsAttention()`: Determines if mine needs creep spawning
-   `hasCapacityToReserve()`: Checks if room can support reservers
-   Invader core detection and protection handling
-   Global `mines` object for manual control (assign, clear, enable, disable)

### build-manager.ts

**Purpose**: Manages construction site placement and removal.

Key features:

-   `getBuildManager(room)`: Factory function for build managers
-   `ensureConstructionSites()`: Places construction sites based on room plan
-   `ensureMineConstructionSites()`: Places sites for remote mining rooms
-   `removeEnemyConstructionSites()`: Clears hostile construction sites
-   `hasNonWallConstructionSites()`: Checks for pending non-wall construction

### energy-manager.ts

**Purpose**: Coordinates energy flow within rooms.

Key features:

-   Tracks energy sources and sinks
-   Manages energy distribution priorities
-   Coordinates between harvesters, logistics, and storage

### energy-sink-manager.ts

**Purpose**: Manages energy storage and distribution targets.

Key features:

-   `EnergySinkManager` class for finding energy destinations
-   `findRepairTarget(creep)`: Finds structures needing repair
-   `canRepairNonWalls(room)`: Checks for non-wall repair needs
-   Repair priority and threshold management

### link-manager.ts

**Purpose**: Manages energy transfer between link structures.

Key features:

-   `LinkManager` class created from room
-   Coordinates source links, storage link, and controller link
-   `run()`: Executes link transfers each tick
-   Balances energy flow from harvesters to storage/controller

### scout-manager.ts

**Purpose**: Manages scouting of unexplored rooms.

Key features:

-   `ScoutManager.create()`: Factory for singleton manager
-   `findNextRoomToScout()`: Determines priority scout targets
-   `run()`: Executes scouting operations
-   Tracks explored rooms and scout assignments

### source-manager.ts

**Purpose**: Manages energy source allocation within a room.

Key features:

-   Tracks source assignments for harvesters
-   Manages container positions at sources
-   Coordinates harvester spawning per source

### sources-manager.ts

**Purpose**: Multi-source management for rooms with multiple energy sources.

Key features:

-   `SourcesManager` class for managing all sources in a room
-   `hasAllContainerHarvesters()`: Checks if all sources have harvesters
-   Source-to-harvester assignment tracking

### types.ts

**Purpose**: Shared type definitions for managers.

Key interfaces and types used across manager files.

## Manager Patterns

### Singleton Pattern

Some managers use singleton-like patterns via factory methods:

```typescript
const manager = ScoutManager.create()
manager.run()
```

### Room-Bound Managers

Most managers are instantiated per-room:

```typescript
const buildManager = getBuildManager(room)
buildManager.ensureConstructionSites()
```

### Static Aggregation

Managers provide static methods for cross-room operations:

```typescript
const allClaimTasks = RoomManager.getAllClaimTasks()
```

## Manager Lifecycle

1. **Initialization**: Managers are created in `main.ts` or room processing
2. **Execution**: `run()` or specific methods called each tick
3. **State**: Managers read from and write to `Room.memory`
4. **Cleanup**: Managers handle their own state cleanup

## Adding a New Manager

1. Create `src/managers/my-manager.ts`
2. Define the manager class with constructor taking `Room` or other context
3. Implement `run()` method for tick-based operations
4. Add any required memory interfaces to global declarations
5. Instantiate and call from `main.ts` or appropriate location
