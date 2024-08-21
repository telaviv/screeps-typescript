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

export type ConstructionMovement = {
    [K in BuildableStructureConstant]: {
        moveTo: Position[] // positions we need to clear to build our obstacles
        moveFrom: Position[] // old locations for the building we want to move
    }
}

export type BaseRoomType = 'base' | 'mine' | 'none'
export interface ConstructionFeaturesV3 {
    version: string
    type: BaseRoomType
    features?: ConstructionFeatures
    points?: StationaryPoints
    links?: Links
    movement?: ConstructionMovement | null
    wipe?: boolean
}

export type diffFeatures = {
    [K in BuildableStructureConstant]?: {
        clear: { pos: Position; structure: BuildableStructureConstant }[]
        vestigial: { pos: Position }[]
    }
}

export type ConstructionFeatures = {
    [K in BuildableStructureConstant]?: Position[]
}

export type StationaryPoints = StationaryPointsBase | StationaryPointsMine

export function isStationaryBase(x: StationaryPoints): x is StationaryPointsBase {
    return x.type === 'base'
}

export interface StationaryPointsBase {
    type: 'base'
    version: string
    sources: { [id: string]: Position }
    controllerLink: Position
    storageLink: Position
}

export interface StationaryPointsMine {
    type: 'mine'
    version: string
    sources: { [id: string]: Position }
}

export interface Links {
    version: string
    controller: Position
    storage: Position
    sourceContainers: {
        source: Id<Source>
        container: Position
        link: Position
    }[]
}

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
