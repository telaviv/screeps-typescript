export enum StrategyPhase {
    RCL_0 = 'rcl-0',
    RCL_1 = 'rcl-1',
    RCL_2 = 'rcl-2',
    RCL_3 = 'rcl-3',
}

const RCL_TO_STRATEGY = [
    StrategyPhase.RCL_0,
    StrategyPhase.RCL_1,
    StrategyPhase.RCL_2,
    StrategyPhase.RCL_3,
]

export default function(room: Room) {
    if (!room.controller) {
        room.memory.strategy = StrategyPhase.RCL_0
    } else {
        room.memory.strategy = RCL_TO_STRATEGY[room.controller.level]
    }
}
