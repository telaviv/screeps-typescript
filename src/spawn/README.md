# Spawn Directory

This directory contains creep spawning logic. It determines what creeps to spawn based on room state, RCL, and current needs.

## Files Overview

### index.ts

**Purpose**: Main spawn orchestration.

Key features:

-   `runSpawn(spawn)`: Called each tick for each spawn structure
-   `SPAWN_STRATEGIES`: Maps `StrategyPhase` to spawn runner functions
-   Currently all RCL levels (0-8) use the same RCL_2 strategy

```typescript
const SPAWN_STRATEGIES: { [k: string]: SpawnRunner } = {
    [StrategyPhase.RCL_0]: RCL_2,
    [StrategyPhase.RCL_1]: RCL_2,
    // ... all levels use RCL_2
}
```

### room-query.ts

**Purpose**: Room capability queries for spawn decisions.

Key features:

-   `RoomQuery` class for analyzing room state
-   `getCreepCount(role)`: Count creeps of specific role
-   Checks for structure counts, energy levels, threats
-   Used by spawn strategies to decide what to spawn

## Strategy Subdirectory

### strategy/rcl-2.ts

**Purpose**: Main spawning strategy for all RCL levels.

Key features:

-   Priority-based spawning queue
-   Checks multiple conditions to decide spawn order
-   Handles rescue mode when no harvesters exist
-   Spawns for remote mining when enabled

Spawn priority order (typical):

1. **Harvesters**: If sources need harvesters
2. **Energy Haulers**: If spawn structures need filling
3. **Logistics**: General workers for building/upgrading
4. **Masons**: Wall repair specialists
5. **Remote operations**: Claimers, remote haulers, scouts
6. **War creeps**: Attackers, healers for military operations

### strategy/create-war-creeps.ts

**Purpose**: War creep spawning logic.

Key features:

-   `createWarCreeps(spawn, warDepartment)`: Spawn military creeps
-   Spawns attackers for offensive operations
-   Spawns healers to support attackers
-   Spawns claimers for room claiming
-   Spawns scouts for exploration

### strategy/constants.ts

**Purpose**: Spawn strategy constants.

Key values:

-   Minimum energy thresholds
-   Creep count limits
-   Spawn timing parameters

### strategy/utils.ts

**Purpose**: Strategy utility functions.

Key features:

-   Helper functions for spawn decisions
-   Common spawn condition checks

## Spawn Decision Flow

1. **Room Strategy**: Room's `memory.strategy` determines which strategy to use
2. **Query State**: `RoomQuery` analyzes current room state
3. **Priority Check**: Strategy checks conditions in priority order
4. **Spawn Request**: First unmet condition triggers creep spawn
5. **Role Creation**: Appropriate role's `create()` method is called

## RoomQuery Class

```typescript
class RoomQuery {
    constructor(room: Room)

    getCreepCount(role: string): number
    // Count creeps with specific role in this room

    // Other query methods for spawn decisions
}
```

## Creating a New Spawn Strategy

1. Create `src/spawn/strategy/my-strategy.ts`
2. Export a function matching `SpawnRunner` type:

    ```typescript
    export default function myStrategy(spawn: StructureSpawn): void {
        const rq = new RoomQuery(spawn.room)

        // Check conditions and spawn creeps
        if (rq.getCreepCount('harvester') < 2) {
            roleHarvester.create(spawn, sourceId)
            return
        }
        // ... more conditions
    }
    ```

3. Register in `src/spawn/index.ts`:
    ```typescript
    const SPAWN_STRATEGIES = {
        [StrategyPhase.RCL_X]: myStrategy,
        // ...
    }
    ```

## Spawn Integration

The spawn system integrates with:

-   **main.ts**: Calls `runSpawn()` for each spawn
-   **strategy.ts**: Provides `StrategyPhase` for room
-   **roles/**: Role `create()` methods handle actual spawning
-   **managers/**: Mine manager triggers remote creep spawning
-   **war-department.ts**: War status triggers military spawning
