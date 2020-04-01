import { StrategyPhase } from 'strategy'
import RCL_0 from './strategy/rcl-0'
import RCL_2 from './strategy/rcl-2'

const SPAWN_STRATEGIES: { [k: string]: SpawnRunner } = {
    [StrategyPhase.RCL_0]: RCL_0,
    [StrategyPhase.RCL_1]: RCL_0,
    [StrategyPhase.RCL_2]: RCL_2,
    [StrategyPhase.RCL_3]: RCL_2,
    [StrategyPhase.RCL_4]: RCL_2,
    [StrategyPhase.RCL_5]: RCL_2,
    [StrategyPhase.RCL_6]: RCL_2,
    [StrategyPhase.RCL_7]: RCL_2,
    [StrategyPhase.RCL_8]: RCL_2,
}

function runSpawn(spawn: StructureSpawn) {
    SPAWN_STRATEGIES[spawn.room.memory.strategy](spawn)
}

export { runSpawn }
