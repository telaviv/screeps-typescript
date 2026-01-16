# Roles Directory

This directory contains creep role definitions. Each role defines the behavior pattern for a specific type of creep, determining what actions they perform each game tick.

## Files Overview

### harvester.ts

**Purpose**: Stationary energy harvesting creeps that sit on designated positions and harvest from sources.

Key features:

-   `HarvesterCreep` class manages harvester behavior
-   Harvests energy from assigned source at stationary position
-   Transfers energy to nearby links when full
-   Repairs containers at harvest position
-   Collects dropped energy and withdraws from containers
-   Body plans scale from 1 WORK/1 MOVE up to 11 WORK/11 MOVE based on available energy

### logistics.ts

**Purpose**: General-purpose worker creeps that handle multiple tasks dynamically.

Key features:

-   `RoleLogistics` class with task-based behavior switching
-   Task types: COLLECTING, HAULING, BUILDING, UPGRADING, REPAIRING, WALL_REPAIRS, TRAVELING
-   Preference system: creeps can prefer specific task types (worker, hauler, builder, etc.)
-   Automatic task assignment based on room needs
-   Suicide mechanism for idle workers to free population cap
-   Visual emojis display current task and preference

### mason.ts

**Purpose**: Dedicated wall and rampart repair creeps.

Key features:

-   Focuses exclusively on repairing walls and ramparts
-   Travels to remote rooms to assist with wall construction
-   Targets fragile walls below RCL-specific hit thresholds

### energy-hauler.ts

**Purpose**: Specialized creeps for hauling energy to spawns and extensions.

Key features:

-   Dedicated to filling spawn structures with energy
-   Higher priority than logistics creeps for critical energy delivery
-   Optimized body with CARRY and MOVE parts

### remote-hauler.ts

**Purpose**: Long-distance haulers for remote mining operations.

Key features:

-   Hauls energy from remote mining rooms back to home room
-   Manages travel between rooms
-   Drops energy at storage or spawn structures

### remote-worker.ts

**Purpose**: Workers that operate in remote rooms (non-home rooms).

Key features:

-   Upgrades controllers in remote rooms
-   Assists with construction in newly claimed territories

### attacker.ts

**Purpose**: Combat creeps for attacking hostile structures and creeps.

Key features:

-   Attacks enemy structures and creeps
-   Used in war operations and room claiming
-   Targets invader cores and hostile spawns

### healer.ts

**Purpose**: Support creeps that heal damaged friendly creeps.

Key features:

-   Heals injured creeps in combat situations
-   Follows attackers to provide support
-   Used in remote mining protection

### claimer.ts

**Purpose**: Creeps with CLAIM parts for reserving or claiming controllers.

Key features:

-   Claims neutral room controllers for expansion
-   Reserves remote mining room controllers
-   Attacks enemy controller reservations

### scout.ts

**Purpose**: Fast exploration creeps for gathering room intelligence.

Key features:

-   Single MOVE part for minimal cost
-   Travels to unexplored rooms
-   Records room data for scouting memory

### wrecker.ts

**Purpose**: Creeps specialized in dismantling structures.

Key features:

-   Uses WORK parts to dismantle enemy structures
-   Targets walls, ramparts, and other obstacles

### rebalancer.ts

**Purpose**: Energy redistribution creeps.

Key features:

-   Moves energy between storage structures
-   Balances energy across the room

### static-link-hauler.ts

**Purpose**: Creeps that manage link-to-storage transfers.

Key features:

-   Stationed near storage and receiver links
-   Withdraws from links and deposits to storage
-   Minimal movement, optimized for throughput

### static-upgrader.ts

**Purpose**: Stationary controller upgrading creeps.

Key features:

-   Positioned near controller with link access
-   Withdraws energy from links
-   Continuously upgrades controller

## Shared Files

### logistics-constants.ts

Defines constants and types used by logistics role:

-   Task type constants (TASK_HAULING, TASK_BUILDING, etc.)
-   `LogisticsPreference` type for creep preferences
-   `LogisticsCreep` and `LogisticsMemory` interfaces

### utils.ts

Shared utility functions for role behaviors:

-   Common movement patterns
-   Target finding helpers

## Role Lifecycle

1. **Spawning**: Spawn strategies in `src/spawn/` determine when and which roles to spawn
2. **Initialization**: Creep memory is set with role-specific data on spawn
3. **Running**: Each tick, `main.ts` calls the appropriate role's `run()` function
4. **Cleanup**: Dead creep memory is periodically cleared

## Creating a New Role

1. Create a new file `src/roles/my-role.ts`
2. Define the creep memory interface extending `CreepMemory`
3. Export a role object with `run(creep)` and `create(spawn, ...)` methods
4. Add the role to `main.ts` in the `runCreep()` function
5. Add spawn logic in `src/spawn/strategy/`
