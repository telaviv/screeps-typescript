export interface Position {
    x: number
    y: number
}

export interface FlatRoomPosition {
    x: number
    y: number
    roomName: string
}

export interface SourceMemory extends CreepMemory {
    source: Id<Source>
}

export interface SourceCreep extends Creep {
    memory: SourceMemory
}

export type ConstructableStructureConstant =
    | 'spawn'
    | 'constructedWall'
    | 'extension'
    | 'link'
    | 'storage'
    | 'tower'
    | 'observer'
    | 'powerSpawn'
    | 'lab'
    | 'terminal'
    | 'nuker'
    | 'factory'

export type Obstacle = typeof OBSTACLE_OBJECT_TYPES[number]
export type NonObstacle = 'road' | 'constructionSite' | 'rampart' | 'container'
// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export function isObstacle(x: any): x is Obstacle {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    return OBSTACLE_OBJECT_TYPES.includes(x)
}

export function isNonObstacle(x: unknown): x is NonObstacle {
    if (typeof x !== 'string') {
        return false
    }
    return ['road', 'constructionSite', 'rampart', 'container'].includes(x)
}
