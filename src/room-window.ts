import { SlidingWindow, SlidingWindowManager } from 'utils/sliding-window'
import { getTotalDroppedResources } from 'tasks/pickup'
import { getTotalWithdrawableResources } from 'tasks/withdraw'
import { wrap } from 'utils/profiling'

declare global {
    interface RoomMemory {
        window: { 'available-energy': Record<99 | 999, SlidingWindow> }
    }
}

const COMPARISON_ENERGY = CONTAINER_CAPACITY * 2

function getRoomEnergy(room: Room): number {
    return getTotalDroppedResources(room) + getTotalWithdrawableResources(room)
}

export const ensureSlidingWindow = wrap((room: Room): void => {
    if (!room.memory.window) {
        const window99 = SlidingWindowManager.create(99)
        const window999 = SlidingWindowManager.create(999)
        room.memory.window = { 'available-energy': { 99: window99.window, 999: window999.window } }
    }
    updateSlidingWindow(room, room.memory.window['available-energy'])
}, 'room-window:ensureSlidingWindow')

function updateSlidingWindow(room: Room, windows: Record<99 | 999, SlidingWindow>): void {
    const availableEnergy = getRoomEnergy(room)
    for (const window of Object.values(windows)) {
        const manager = new SlidingWindowManager(window)
        manager.add(availableEnergy, Game.time)
    }
}

/** Returns a % of 2 containers with how much energy can be picked up */
export const getSlidingEnergy = wrap((roomMemory: RoomMemory, size: 99 | 999): number => {
    const manager = new SlidingWindowManager(roomMemory.window['available-energy'][size])
    return manager.average() / COMPARISON_ENERGY
}, 'room-window:getSlidingEnergy')
