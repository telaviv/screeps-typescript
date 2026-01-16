# Screeps TypeScript Bot - Source Directory

This is the main source directory for a Screeps game bot written in TypeScript. Screeps is an MMO strategy game where players write JavaScript/TypeScript code to control autonomous units (creeps) that harvest resources, build structures, and defend territories.

## Directory Structure

```
src/
├── main.ts              # Game loop entry point
├── empire.ts            # High-level empire coordination
├── strategy.ts          # Room Controller Level (RCL) strategy assignment
├── war-department.ts    # Military operations (attack, claim, spawn wars)
├── defense-department.ts # Defense logic (towers, attackers, healers)
├── constants.ts         # Global game constants
├── types.ts             # Core type definitions
├── roles/               # Creep behavior definitions
├── managers/            # Game system managers
├── tasks/               # Task queue system for creep actions
├── utils/               # Utility functions and helpers
├── spawn/               # Creep spawning logic
├── data-structures/     # Graph algorithms and data structures
├── stamps/              # Building layout templates
├── pub-sub/             # Event publish-subscribe system
└── room-analysis/       # Room layout analysis algorithms
```

## Core Files

### main.ts

The game loop entry point that executes every game tick. Responsibilities:

-   Initializes globals and runs migrations
-   Clears dead creep memory
-   Runs scout manager and empire coordination
-   Updates room strategies based on RCL
-   Executes room-specific logic (links, towers, spawns, construction)
-   Runs all creep role behaviors
-   Records game statistics and manages caches

### empire.ts

High-level empire management class that coordinates across all owned rooms:

-   `findClaimCandidates()`: Identifies rooms suitable for expansion
-   `autoClaim()`: Automatically initiates room claiming when conditions are met
-   `findSaviors()`: Assigns helper rooms to spawnless rooms in distress
-   `getRoomTasks()`: Aggregates all room tasks across the empire

### strategy.ts

Manages room strategy phases based on Room Controller Level (RCL 0-8). Each room is assigned a `StrategyPhase` that determines spawn priorities and building strategies.

### war-department.ts

Handles military operations with status tracking:

-   `WarStatus.NONE`: No active war
-   `WarStatus.ATTACK`: Attacking enemy room
-   `WarStatus.CLAIM`: Claiming neutral room
-   `WarStatus.SPAWN`: Building spawns in newly claimed room

### Other Core Files

-   **claim.ts**: Room claiming evaluation logic
-   **surveyor.ts**: Room surveying and analysis
-   **hostiles.ts**: Hostile creep tracking and danger level recording
-   **tower.ts**: Tower defense targeting logic
-   **construction-features.ts**: Room construction planning and bunker placement
-   **matrix-cache.ts**: Pathfinding cost matrix caching
-   **room-visualizer.ts**: Visual debugging overlays

## Game Loop Flow

1. **Initialize**: Setup globals, run migrations, clear dead creep memory
2. **Scout**: Run scout manager to explore new rooms
3. **Empire**: Run empire-level coordination
4. **Survey**: Analyze room layouts for construction
5. **Rooms**: For each owned room:
    - Update strategy based on RCL
    - Manage links, towers, and spawns
    - Handle construction sites
    - Run remote mining operations
6. **Creeps**: Execute role-specific behavior for each creep
7. **Cleanup**: Clear caches, record statistics

## File-Level Documentation

### main.ts

**Game loop entry point** - The core file that runs every game tick.

| Function               | Description                                               |
| ---------------------- | --------------------------------------------------------- |
| `loop()`               | Main export, wrapped game loop with error mapping         |
| `unwrappedLoop()`      | Actual game loop: initialize → rooms → creeps → cleanup   |
| `initialize()`         | Setup globals, clear creep memory, run scouts and empire  |
| `runMyRoom(room)`      | Per-room tick: links, towers, spawns, construction, mines |
| `runCreep(name)`       | Dispatch creep to appropriate role handler                |
| `clearCreepMemory()`   | Remove memory for dead creeps (every 500 ticks)           |
| `ensureSafeMode(room)` | Activate safe mode when structures are destroyed          |

### empire.ts

**High-level empire coordination** across all owned rooms.

| Class/Function          | Description                                                |
| ----------------------- | ---------------------------------------------------------- |
| `Empire`                | Main class coordinating multi-room operations              |
| `run()`                 | Clear/find saviors, run auto-claim, update war departments |
| `autoClaim()`           | Automatically claim new rooms when GCL allows              |
| `findClaimCandidates()` | Find suitable rooms for expansion (2 sources, no enemies)  |
| `findBestClaimPair()`   | Match candidate rooms with best claimer rooms              |
| `findSaviors()`         | Assign helper rooms to spawnless rooms                     |
| `getBestNearbyRoom()`   | Find closest capable room for assistance                   |

### strategy.ts

**Room strategy phase management** based on Room Controller Level.

| Export                     | Description                                         |
| -------------------------- | --------------------------------------------------- |
| `StrategyPhase`            | Enum: RCL_0 through RCL_8                           |
| `default` (updateStrategy) | Sets room.memory.strategy based on controller level |

### war-department.ts

**Military operations management** for attacks, claims, and spawn wars.

| Class/Export         | Description                               |
| -------------------- | ----------------------------------------- |
| `WarDepartment`      | Per-room war management class             |
| `WarStatus`          | Enum: NONE, ATTACK, CLAIM, SPAWN          |
| `WarMemory`          | Memory interface for war state            |
| `update()`           | Transition war status based on room state |
| `declareWar(target)` | Start attack on target room               |
| `claimRoom(target)`  | Start claiming target room                |
| `saveRoom(target)`   | Start saving a spawnless room             |
| `needsProtection`    | Check if target room has hostile threats  |
| `hasHostiles()`      | Check for dangerous hostile creeps        |

### defense-department.ts

**Defense coordination** for towers, attackers, and healers.

| Class/Method                      | Description                          |
| --------------------------------- | ------------------------------------ |
| `DefenseDepartment`               | Per-room defense management          |
| `needsDefenders()`                | Check if room needs attack creeps    |
| `attackPartsNeeded()`             | Calculate required ATTACK parts      |
| `needsHealer()`                   | Check if injured creeps need healing |
| `createDefender(spawn, capacity)` | Spawn attacker creep                 |
| `createHealer(spawn)`             | Spawn healer creep                   |
| `hasOverwhelmingForce()`          | Check if enemy force is too strong   |

### constants.ts

**Global constants** for game configuration.

| Export                           | Description                                 |
| -------------------------------- | ------------------------------------------- |
| `ALL_BUILDABLE_STRUCTURES`       | Array of all buildable structure types      |
| `isBuildableStructureConstant()` | Type guard for buildable structures         |
| `MAX_SAVIOR_DISTANCE`            | Max distance (5) for savior room assignment |
| `MAX_CLAIM_DISTANCE`             | Max distance (3) for room claiming          |
| `ENEMY_DISTANCE_BUFFER`          | Buffer distance (1) from enemy rooms        |

### types.ts

**Core type definitions** used throughout the codebase.

| Type/Interface                   | Description                         |
| -------------------------------- | ----------------------------------- |
| `Position`                       | Simple {x, y} coordinate            |
| `FlatRoomPosition`               | {x, y, roomName} for serialization  |
| `SourceMemory`                   | Creep memory with source assignment |
| `SourceCreep`                    | Creep type with SourceMemory        |
| `ConstructableStructureConstant` | Union of placeable structure types  |
| `Obstacle`                       | Structure types that block movement |
| `isObstacle()`                   | Type guard for obstacle structures  |

### types.d.ts

**Ambient type declarations** for global augmentation.

### claim.ts

**Room claiming evaluation** logic.

| Function                          | Description                                                                      |
| --------------------------------- | -------------------------------------------------------------------------------- |
| `canBeClaimCandidate(roomMemory)` | Check if room is suitable for claiming (2 sources, not blocked, not enemy-owned) |

### hostiles.ts

**Hostile creep tracking** and danger level recording.

| Class/Method               | Description                                               |
| -------------------------- | --------------------------------------------------------- |
| `HostileRecorder`          | Records hostile presence over time window                 |
| `record()`                 | Record current hostile creeps in room                     |
| `dangerLevel()`            | Calculate danger based on ATTACK/RANGED_ATTACK/HEAL parts |
| `getDangerLevel(roomName)` | Static helper to get danger level                         |
| `HOSTILE_WINDOW`           | Time window (1000 ticks) for tracking                     |

### surveyor.ts

**Room surveying and construction feature calculation**.

| Function                              | Description                                         |
| ------------------------------------- | --------------------------------------------------- |
| `survey()`                            | Main survey function (profiled)                     |
| `isSurveyComplete(room)`              | Check if room has all construction features         |
| `setConstructionFeaturesV3(roomName)` | Calculate and store construction features           |
| `calculateConstructionFeaturesV3()`   | Generate full construction plan for room            |
| `calculateBunkerImmutableRoom()`      | Create immutable room with bunker stamp             |
| `getRampartPositions()`               | Calculate rampart positions using min-cut algorithm |

### construction-features.ts

**Construction planning types and accessors**.

| Type/Function                         | Description                                  |
| ------------------------------------- | -------------------------------------------- |
| `ConstructionFeaturesV3`              | Main construction plan type (base/mine/none) |
| `ConstructionFeatures`                | Map of structure types to positions          |
| `StationaryPoints`                    | Positions where creeps should stand          |
| `Links`                               | Link structure configuration                 |
| `getConstructionFeaturesV3(room)`     | Get construction plan for room               |
| `getConstructionFeatures(room)`       | Get structure positions                      |
| `getStationaryPoints(room)`           | Get stationary creep positions               |
| `getCalculatedLinks(room)`            | Get link configuration                       |
| `constructionFeaturesV3NeedsUpdate()` | Check if plan needs recalculation            |

### construction-movement.ts

**Structure movement/destruction** during base reconfiguration.

| Function                              | Description                                   |
| ------------------------------------- | --------------------------------------------- |
| `isMoving(room)`                      | Check if room has pending structure movements |
| `wipeRoom(room)`                      | Destroy all structures and unclaim controller |
| `destroyMovementStructures(room)`     | Remove structures that need to move           |
| `clearConstructionMovement(roomName)` | Global helper to clear movements              |

### tower.ts

**Tower defense logic**.

| Function               | Description                                     |
| ---------------------- | ----------------------------------------------- |
| `runTower(tower)`      | Per-tower tick: attack hostiles or repair roads |
| `isDamaged(structure)` | Check if road needs repair (>150 damage)        |
| `TOWER_CHECK_TIME`     | Repair check interval (5 ticks)                 |

### matrix-cache.ts

**Pathfinding cost matrix caching** for performance.

| Class/Method                               | Description                                                           |
| ------------------------------------------ | --------------------------------------------------------------------- |
| `MatrixCacheManager`                       | Per-room matrix cache management                                      |
| `getRoomMatrix(roomName, roadPreferred)`   | Get full room cost matrix                                             |
| `getTravelMatrix(roomName, roadPreferred)` | Get travel-optimized matrix                                           |
| `getCostMatrix(tags)`                      | Get matrix with specific features                                     |
| `addSubscriptions()`                       | Subscribe to construction feature updates                             |
| `clearCaches()`                            | Evict old cached matrices                                             |
| `MatrixTag`                                | Tags: default-terrain, road-preferred-terrain, no-edges, no-obstacles |

### room-visualizer.ts

**Visual debugging overlays** for room analysis.

| Class/Function                 | Description                        |
| ------------------------------ | ---------------------------------- |
| `RoomVisualizer`               | Per-room visual rendering          |
| `MapVisualizer`                | Game map visual rendering          |
| `visualize()`                  | Main entry point for all visuals   |
| `renderConstructionFeatures()` | Draw planned structures            |
| `renderTransform()`            | Draw distance transform numbers    |
| `global.visuals`               | Console commands for visualization |

### room-window.ts

**Sliding window tracking** for room energy availability.

| Function                           | Description                               |
| ---------------------------------- | ----------------------------------------- |
| `ensureSlidingWindow(room)`        | Initialize/update energy tracking windows |
| `getSlidingEnergy(roomName, size)` | Get average available energy over window  |

### room-graph.ts

**Room graph traversal** using BFS.

| Function                          | Description                                |
| --------------------------------- | ------------------------------------------ |
| `roomSearch(roomNames, maxDepth)` | BFS search from starting rooms             |
| Returns                           | Array of {name, depth} for reachable rooms |

### migrations.ts

**Data migration** for memory version updates.

| Function    | Description                                                  |
| ----------- | ------------------------------------------------------------ |
| `migrate()` | Run any pending migrations (currently sets version to 1.0.0) |

### snapshot.ts

**Room structure snapshots** using immutable data structures.

| Class/Function                  | Description                           |
| ------------------------------- | ------------------------------------- |
| `RoomSnapshot`                  | Immutable snapshot of room structures |
| `getStructurePos(type, filter)` | Find unbuilt structure position       |
| `hasStructure(type)`            | Check if structure type is planned    |
| `addStructure(type, pos)`       | Add structure to snapshot             |
| `loadFromRoom()`                | Load current structures and flags     |
| `saveToMemory()`                | Persist snapshot to room memory       |

### pokemon.ts

**Pokemon name generator** for creep naming.

| Export      | Description                                     |
| ----------- | ----------------------------------------------- |
| `default()` | Returns random lowercase Pokemon name (Gen 1-8) |

## Subdirectory Guides

Each subdirectory contains its own README.md with detailed documentation:

-   [roles/README.md](./roles/README.md) - Creep role behaviors
-   [managers/README.md](./managers/README.md) - Game system managers
-   [tasks/README.md](./tasks/README.md) - Task queue system
-   [utils/README.md](./utils/README.md) - Utility functions
-   [spawn/README.md](./spawn/README.md) - Spawning strategies
-   [data-structures/README.md](./data-structures/README.md) - Graph algorithms
-   [stamps/README.md](./stamps/README.md) - Building templates
-   [pub-sub/README.md](./pub-sub/README.md) - Event system
-   [room-analysis/README.md](./room-analysis/README.md) - Room analysis algorithms
