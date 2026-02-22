export const MIN_USEFUL_LINK_ENERGY = BODYPART_COST[CARRY] * 9 + BODYPART_COST[MOVE]
/** Max energy to spend on a harvester when operating at limited capacity (6M 6W 1C) */
export const MAX_LIMITED_HARVESTER_CAPACITY =
    BODYPART_COST[MOVE] * 6 + BODYPART_COST[WORK] * 6 + BODYPART_COST[CARRY]
export const MAX_USEFUL_ENERGY =
    BODYPART_COST[CARRY] * 12 + BODYPART_COST[WORK] * 12 + BODYPART_COST[MOVE] * 24
export const MAX_DROPPED_RESOURCES = 1000
export const LATENT_WORKER_INTERVAL_MULTIPLIER = 200
export const SPAWN_CHECK_MOD = 4
export const UPGRADERS_COUNT = 1
export const BUILDERS_COUNT = 1
export const MASON_COUNT = 1
export const RESCUE_WORKER_COUNT = 3
export const ATTACKERS_COUNT = 2
