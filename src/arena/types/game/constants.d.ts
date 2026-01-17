// Body parts
export declare const MOVE: 'move'
export declare const WORK: 'work'
export declare const CARRY: 'carry'
export declare const ATTACK: 'attack'
export declare const RANGED_ATTACK: 'ranged_attack'
export declare const TOUGH: 'tough'
export declare const HEAL: 'heal'
export declare const CLAIM: 'claim'

// Terrain types
export declare const TERRAIN_PLAIN: 0
export declare const TERRAIN_SWAMP: 2
export declare const TERRAIN_WALL: 1

// Error codes
export declare const OK: 0
export declare const ERR_NOT_OWNER: -1
export declare const ERR_NO_PATH: -2
export declare const ERR_NAME_EXISTS: -3
export declare const ERR_BUSY: -4
export declare const ERR_NOT_FOUND: -5
export declare const ERR_NOT_ENOUGH_RESOURCES: -6
export declare const ERR_NOT_ENOUGH_ENERGY: -6
export declare const ERR_INVALID_TARGET: -7
export declare const ERR_FULL: -8
export declare const ERR_NOT_IN_RANGE: -9
export declare const ERR_INVALID_ARGS: -10
export declare const ERR_TIRED: -11
export declare const ERR_NO_BODYPART: -12
export declare const ERR_RCL_NOT_ENOUGH: -14
export declare const ERR_GCL_NOT_ENOUGH: -15

// Body part types
export type BodyPartConstant =
    | typeof MOVE
    | typeof WORK
    | typeof CARRY
    | typeof ATTACK
    | typeof RANGED_ATTACK
    | typeof TOUGH
    | typeof HEAL
    | typeof CLAIM
