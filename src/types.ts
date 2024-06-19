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

export type ConstructionFeatures = {
    [K in BuildableStructureConstant]?: Position[]
}
export type Obstacle = typeof OBSTACLE_OBJECT_TYPES[number]
export type NonObstacle = 'road' | 'constructionSite' | 'rampart' | 'container'
// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export function isObstacle(x: any): x is Obstacle {
    return OBSTACLE_OBJECT_TYPES.includes(x)
}
