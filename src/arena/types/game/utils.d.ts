import { GameObject } from './prototypes'

export declare function getObjectsByPrototype<T extends GameObject>(
    prototype: new (...args: any[]) => T,
): T[]

export declare function findClosestByPath<T extends GameObject>(
    position: { x: number; y: number },
    objects: T[],
): T | null

export declare function findClosestByRange<T extends GameObject>(
    position: { x: number; y: number },
    objects: T[],
): T | null

export declare function findInRange<T extends GameObject>(
    position: { x: number; y: number },
    objects: T[],
    range: number,
): T[]

export declare function getRange(a: { x: number; y: number }, b: { x: number; y: number }): number

export declare function getTerrainAt(position: { x: number; y: number }): number
