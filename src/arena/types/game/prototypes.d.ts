import { BodyPartConstant } from './constants'

export interface GameObject {
    id: string
    x: number
    y: number
}

export interface RoomPosition {
    x: number
    y: number
}

export interface BodyPart {
    type: BodyPartConstant
    hits: number
}

export interface Creep extends GameObject {
    x: number
    y: number
    body: BodyPart[]
    hits: number
    hitsMax: number
    my: boolean

    attack(target: GameObject): number
    rangedAttack(target: GameObject): number
    heal(target: Creep): number
    moveTo(target: GameObject | RoomPosition): number
    move(direction: number): number
}

export interface Structure extends GameObject {
    x: number
    y: number
    hits: number
    hitsMax: number
    my: boolean
}

export interface StructureSpawn extends Structure {
    x: number
    y: number
    spawnCreep(body: BodyPartConstant[]): { object?: Creep; error: number }
}

export interface OwnedStructure extends Structure {
    my: boolean
}

export declare const Creep: new () => Creep
export declare const Structure: new () => Structure
export declare const StructureSpawn: new () => StructureSpawn

export interface Flag extends GameObject {
    x: number
    y: number
    my: boolean
}

export declare const Flag: new () => Flag
