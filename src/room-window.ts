import { SlidingWindow, SlidingWindowManager } from 'utils/sliding-window'
import { getTotalDroppedResources } from 'tasks/pickup'
import { getTotalWithdrawableResources } from 'tasks/withdraw'
import { wrap } from 'utils/profiling'

declare global {
    interface RoomMemory {
        window: { 'available-energy': Record<99 | 999, SlidingWindow> }
    }
}

/**
 * Gets total available energy in a room (dropped + withdrawable).
 * @param room - The room to check
 */
function getRoomEnergy(room: Room): number {
    return getTotalDroppedResources(room) + getTotalWithdrawableResources(room)
}

/**
 * Initializes and updates sliding window energy tracking for a room.
 * Creates windows of size 99 and 999 ticks for energy averaging.
 * @param room - The room to track
 */
export const ensureSlidingWindow = wrap((room: Room): void => {
    if (!room.memory.window) {
        const window99 = SlidingWindowManager.create(99)
        const window999 = SlidingWindowManager.create(999)
        room.memory.window = { 'available-energy': { 99: window99.window, 999: window999.window } }
    }
    updateSlidingWindow(room, room.memory.window['available-energy'])
}, 'room-window:ensureSlidingWindow')

/**
 * Updates all sliding windows with current room energy.
 * @param room - The room to get energy from
 * @param windows - The sliding windows to update
 */
function updateSlidingWindow(room: Room, windows: Record<99 | 999, SlidingWindow>): void {
    const availableEnergy = getRoomEnergy(room)
    for (const window of Object.values(windows)) {
        const manager = new SlidingWindowManager(window)
        manager.add(availableEnergy, Game.time)
    }
}

/**
 * Gets average energy as a percentage of container capacity.
 * @param roomName - Name of the room
 * @param size - Window size (99 or 999 ticks)
 * @param sourceCount - Number of sources for normalization
 * @returns Percentage of container capacity available
 */
export const getSlidingEnergy = wrap(
    (roomName: string, size: 99 | 999, sourceCount = 2): number => {
        const memory = Memory.rooms[roomName]
        if (!memory) {
            throw new Error(`room-window:getSlidingEnergy: ${roomName} memory not found`)
        }
        const manager = new SlidingWindowManager(memory.window['available-energy'][size])
        return (manager.average() / CONTAINER_CAPACITY) * sourceCount
    },
    'room-window:getSlidingEnergy',
)
