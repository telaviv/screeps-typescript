// Body parts
export const MOVE = 'move'
export const WORK = 'work'
export const CARRY = 'carry'
export const ATTACK = 'attack'
export const RANGED_ATTACK = 'ranged_attack'
export const TOUGH = 'tough'
export const HEAL = 'heal'
export const CLAIM = 'claim'

// Error codes
export const OK = 0
export const ERR_NOT_OWNER = -1
export const ERR_NO_PATH = -2
export const ERR_NAME_EXISTS = -3
export const ERR_BUSY = -4
export const ERR_NOT_FOUND = -5
export const ERR_NOT_ENOUGH_RESOURCES = -6
export const ERR_NOT_ENOUGH_ENERGY = -6
export const ERR_INVALID_TARGET = -7
export const ERR_FULL = -8
export const ERR_NOT_IN_RANGE = -9
export const ERR_INVALID_ARGS = -10
export const ERR_TIRED = -11
export const ERR_NO_BODYPART = -12
export const ERR_RCL_NOT_ENOUGH = -14
export const ERR_GCL_NOT_ENOUGH = -15

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
