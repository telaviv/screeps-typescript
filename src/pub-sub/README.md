# Pub-Sub Directory

This directory implements a publish-subscribe (pub-sub) event system for loose coupling between game components.

## Files Overview

### pub-sub.ts

**Purpose**: Core publish-subscribe implementation.

#### Subscribe Function

Register a callback for specific events:

```typescript
function subscribe(
    type: string, // Event category
    key: string, // Specific event identifier
    id: string, // Subscriber ID (for deduplication)
    callback: (data: unknown) => void,
): void
```

Example:

```typescript
subscribe('room', 'hostiles-detected', 'defense-module', (data) => {
    console.log('Hostiles detected:', data)
})
```

#### Publish Function

Emit an event to all subscribers:

```typescript
function publish(
    type: string, // Event category
    key: string, // Specific event identifier
    data?: unknown, // Optional event data
): void
```

Example:

```typescript
publish('room', 'hostiles-detected', { roomName: 'W1N1', count: 5 })
```

### constants.ts

**Purpose**: Event type and key constants.

Defines standard event names to avoid typos and enable refactoring:

```typescript
export const EVENTS = {
    ROOM: {
        HOSTILES_DETECTED: 'hostiles-detected',
        STRUCTURE_BUILT: 'structure-built',
        // ...
    },
    CREEP: {
        SPAWNED: 'spawned',
        DIED: 'died',
        // ...
    },
}
```

## Implementation Details

### Global Storage

Subscriptions are stored on the global object:

```typescript
global.pubsub = {
    'room:hostiles-detected': {
        'defense-module': callback1,
        'alert-system': callback2,
    },
    // ...
}
```

### Subscription Key Format

Events are keyed as `${type}:${key}`:

-   `room:hostiles-detected`
-   `creep:spawned`
-   `matrix:invalidated`

### Subscriber ID

The `id` parameter prevents duplicate subscriptions:

```typescript
// Only one subscription per ID per event
subscribe('room', 'event', 'my-module', callback)
subscribe('room', 'event', 'my-module', newCallback) // Replaces previous
```

## Use Cases

### Matrix Cache Invalidation

```typescript
// In matrix-cache.ts
subscribe('room', 'structure-changed', 'matrix-cache', () => {
    clearMatrixCache()
})

// When structure is built/destroyed
publish('room', 'structure-changed', { roomName: room.name })
```

### Defense Alerts

```typescript
// In defense-department.ts
subscribe('room', 'hostiles-detected', 'defense', (data) => {
    activateDefense(data.roomName)
})

// In hostiles.ts
if (newHostilesDetected) {
    publish('room', 'hostiles-detected', { roomName, count })
}
```

### Spawn Events

```typescript
// Track creep populations
subscribe('creep', 'spawned', 'census', (data) => {
    updateCreepCount(data.role, 1)
})

subscribe('creep', 'died', 'census', (data) => {
    updateCreepCount(data.role, -1)
})
```

## Best Practices

1. **Use Constants**: Define event names in `constants.ts`
2. **Unique IDs**: Use descriptive subscriber IDs
3. **Clean Data**: Keep event data serializable
4. **Logging**: Use Logger for pub-sub debugging
5. **Avoid Cycles**: Don't publish in response to same event type

## Limitations

-   **No Persistence**: Subscriptions reset on global reset
-   **Synchronous**: Callbacks execute immediately on publish
-   **No Ordering**: Callback order is not guaranteed
-   **Memory**: Subscriptions stored in global object

## Integration

The pub-sub system integrates with:

-   **matrix-cache.ts**: Cache invalidation on room changes
-   **main.ts**: Event subscriptions in initialization
-   **Various managers**: Loose coupling between systems
