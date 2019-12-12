const STARTER_PHASE_HARVESTER_COUNT = 6

export enum StrategyPhase {
    Starter = 'starter',
    DropMining = 'drop mining',
}

export default function(room: Room) {
    if (!room.memory.strategy) {
        room.memory.strategy = StrategyPhase.Starter
    } else if (room.memory.strategy === StrategyPhase.Starter) {
        if (room.find(FIND_MY_CREEPS).length >= STARTER_PHASE_HARVESTER_COUNT) {
            room.memory.strategy = StrategyPhase.DropMining
        }
    }
}
