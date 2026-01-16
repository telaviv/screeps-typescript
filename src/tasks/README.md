# Tasks Directory

This directory implements a task queue system for creep actions. Tasks allow complex, multi-step behaviors to be composed and executed over multiple game ticks.

## Core Concepts

### Task Queue

Each creep has a `tasks` array in memory. Tasks are processed in order (FIFO). When a task completes, it's removed and the next task begins.

### Task Interface

```typescript
interface Task<T> {
    type: string // Task type identifier
    complete: boolean // Whether task is finished
    data: T // Task-specific data
}
```

### Runner Pattern

Each task type has a "Runner" that handles execution:

-   `verifyType(task)`: Type guard for the task
-   `run(task, creep)`: Execute the task, return true if complete
-   `cleanup(task, creep)`: Check if task should be removed early

## Core Files

### index.ts

**Purpose**: Task system exports and global declarations.

Key features:

-   Exports `Task` and `TaskMemory` types
-   Declares `tasks` array on `CreepMemory`
-   `deleteAllTasks()`: Debug function to clear all creep tasks

### runner.ts

**Purpose**: Central task execution dispatcher.

Key features:

-   `run(task, creep)`: Finds appropriate runner and executes task
-   `cleanup()`: Cleans completed tasks from all creeps each tick
-   Iterates through all registered runners to find matching type
-   Throws error if task type has no registered runner

### types.ts

**Purpose**: Core type definitions for the task system.

Key types:

-   `Task<T>`: Generic task interface
-   `ResourceCreep`: Creep with task-related memory
-   `ResourceCreepMemory`: Memory interface with tasks array
-   `Runner<T>`: Interface for task runners

### utils.ts

**Purpose**: Task utility functions.

Key functions:

-   `findTaskByType(type)`: Find active task across all creeps
-   Task validation helpers

### usage-utils.ts

**Purpose**: High-level task creation utilities.

Key functions:

-   `addEnergyTask(creep, opts)`: Creates appropriate energy collection task
-   Coordinates between pickup, withdraw, and mining tasks

## Task Subdirectories

Each task type has its own subdirectory with consistent structure:

### mining/

**Purpose**: Mining energy from sources.

Files:

-   `index.ts`: MiningRunner and `addMiningTask()`
-   `types.ts`: `MiningTask` interface
-   `utils.ts`: `isMiningTask()` type guard

Behavior:

-   Creep moves to source and harvests
-   Completes when creep is full or source is empty

### transfer/

**Purpose**: Transferring energy to structures.

Files:

-   `index.ts`: TransferRunner and `makeRequest()`
-   `structure.ts`: Structure-specific transfer logic
-   `types.ts`: `TransferTask` interface
-   `utils.ts`: `isTransferTask()` type guard

Behavior:

-   Finds spawn/extension/tower needing energy
-   Moves to structure and transfers energy
-   Completes when transfer succeeds or structure is full

### withdraw/

**Purpose**: Withdrawing energy from containers/storage.

Files:

-   `index.ts`: WithdrawRunner and `addWithdrawTask()`
-   `object.ts`: Withdraw target selection
-   `types.ts`: `WithdrawTask` interface
-   `utils.ts`: `isWithdrawTask()` type guard

Behavior:

-   Targets containers, storage, or links with energy
-   Moves to target and withdraws
-   Completes when creep is full or target is empty

### pickup/

**Purpose**: Picking up dropped resources.

Files:

-   `index.ts`: PickupRunner and `addPickupTask()`
-   `target.ts`: Dropped resource target selection
-   `types.ts`: `PickupTask` interface
-   `utils.ts`: `isPickupTask()` type guard

Behavior:

-   Targets dropped energy on ground
-   Moves to resource and picks up
-   Completes when resource is collected

### travel/

**Purpose**: Moving to specific positions or rooms.

Files:

-   `index.ts`: TravelRunner
-   `types.ts`: `TravelTask` interface
-   `utils.ts`: `isTravelTask()` type guard

Behavior:

-   Moves creep to target position
-   Completes when creep reaches destination

### sign/

**Purpose**: Signing room controllers.

Files:

-   `index.ts`: SignRunner and `makeRequest()`
-   `types.ts`: `SignTask` interface
-   `utils.ts`: Helper functions

Behavior:

-   Moves to room controller
-   Signs controller with message
-   Completes after signing

## Task Execution Flow

1. **Creation**: Task added to creep's `tasks` array
2. **Running**: Each tick, `TaskRunner.run()` called with first task
3. **Completion**: Task sets `complete = true` when done
4. **Cleanup**: `TaskRunner.cleanup()` removes completed tasks

## Creating a New Task Type

1. Create subdirectory `src/tasks/my-task/`
2. Define types in `types.ts`:
    ```typescript
    export interface MyTask extends Task<MyTaskData> {
        type: 'my-task'
        data: { targetId: Id<Structure> }
    }
    ```
3. Create runner in `index.ts`:
    ```typescript
    const MyTaskRunner: Runner<MyTask> = {
        verifyType: (task): task is MyTask => task.type === 'my-task',
        run: (task, creep) => {
            /* ... */
        },
        cleanup: (task, creep) => {
            /* ... */
        },
    }
    ```
4. Add utility functions in `utils.ts`
5. Register runner in `src/tasks/runner.ts`
