import { wrap } from 'utils/profiling'

/**
 * Enum representing the strategic phase of a room based on its Room Controller Level.
 * Used to determine spawning strategies and room behavior.
 */
export enum StrategyPhase {
    RCL_0 = 'rcl-0',
    RCL_1 = 'rcl-1',
    RCL_2 = 'rcl-2',
    RCL_3 = 'rcl-3',
    RCL_4 = 'rcl-4',
    RCL_5 = 'rcl-5',
    RCL_6 = 'rcl-6',
    RCL_7 = 'rcl-7',
    RCL_8 = 'rcl-8',
}

/** Maps RCL number to corresponding StrategyPhase */
const RCL_TO_STRATEGY = [
    StrategyPhase.RCL_0,
    StrategyPhase.RCL_1,
    StrategyPhase.RCL_2,
    StrategyPhase.RCL_3,
    StrategyPhase.RCL_4,
    StrategyPhase.RCL_5,
    StrategyPhase.RCL_6,
    StrategyPhase.RCL_7,
    StrategyPhase.RCL_8,
]

/**
 * Updates the strategy phase for a room based on its controller level.
 * Sets room.memory.strategy to the appropriate StrategyPhase enum value.
 * @param room - The room to update
 */
export default wrap((room: Room) => {
    if (!room.controller) {
        room.memory.strategy = StrategyPhase.RCL_0
    } else {
        room.memory.strategy = RCL_TO_STRATEGY[room.controller.level]
    }
}, 'updateStrategy')
