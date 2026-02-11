# Mine Roads Pathfinding Investigation

## Problem Summary

The integration test for W1N8 mine roads reveals that **no paths can be found** from the storage link hauler position to any of the three mine rooms (W1N7, W1N9, W2N8) when obstacles are set to impassable (cost=255).

## Root Cause

The bunker stamp places buildings that completely surround the storage area, creating a "walled" bunker. The `calculateBunkerRoads` function only creates roads to:

-   Internal sources
-   Controller
-   Mineral

It does **NOT** create roads that extend from the storage area to room exits, which are necessary for mine roads pathfinding.

## Evidence

1. **Visual Confirmation**: The user verified that a clear corridor exists in the stamp: SW → NW → N → NE → NE from the storage link hauler position (12,29) to the north exit.

2. **Cost Analysis**: The clean corridor has much lower cost (~6.7) compared to cutting through obstacles (~97.6).

3. **Pathfinding Behavior**:
    - With obstacle cost=20 (passable but expensive), the A\* pathfinder finds paths but routes through obstacles because it only considers walkability, not weights.
    - With obstacle cost=255 (impassable), no paths are found because the bunker buildings block all exits and bunker roads don't connect to exits.

## Attempted Solutions

### 1. Weighted Pathfinding with EasyStar ❌

-   Installed `easystarjs` library
-   Created `findWeightedMultiRoomPathSync` function
-   **Issue**: EasyStar's `calculate()` is fundamentally asynchronous, making it difficult to use in synchronous contexts
-   **Result**: Unable to get EasyStar working reliably in the test environment

### 2. Original Pathfinder with Impassable Obstacles ✅ (Current State)

-   Set obstacles to cost=255 (truly impassable)
-   **Result**: Test correctly identifies that no valid paths exist, revealing the design flaw

## Recommended Fix

Enhance `src/stamps/roads.ts` (`calculateBunkerRoads`) to:

1. Identify which room exits are accessible from the bunker
2. Create road paths from the storage area to each accessible exit
3. Ensure these roads avoid or route around bunker buildings

## Test Status

The test is **functioning as intended** - it successfully detects when mine roads would intersect obstacles or when no valid paths exist. The failures indicate a real issue with the bunker road generation, not a bug in the test or pathfinding logic.

## Next Steps

1. Update `calculateBunkerRoads` to include exit roads
2. Re-run the test to verify paths can be found
3. Ensure mine roads use the bunker's exit roads and avoid obstacles
