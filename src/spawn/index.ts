import { StrategyPhase } from 'strategy'
import dropMining from './strategy/drop-mining'
import starter from './strategy/starter'

const SPAWN_STRATEGIES: { [k: string]: SpawnRunner } = {
    [StrategyPhase.DropMining]: dropMining,
    [StrategyPhase.Starter]: starter,
}

function runSpawn(spawn: StructureSpawn) {
    SPAWN_STRATEGIES[spawn.room.memory.strategy](spawn)
}

export { runSpawn }
