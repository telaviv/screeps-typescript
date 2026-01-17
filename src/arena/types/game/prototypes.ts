import { BodyPartConstant } from './constants';

export interface GameObject {
  id: string;
  x: number;
  y: number;
}

export interface RoomPosition {
  x: number;
  y: number;
}

export interface Creep extends GameObject {
  body: BodyPartConstant[];
  hits: number;
  hitsMax: number;
  my: boolean;

  attack(target: GameObject): number;
  rangedAttack(target: GameObject): number;
  heal(target: Creep): number;
  moveTo(target: GameObject | RoomPosition): number;
  move(direction: number): number;
}

export interface Structure extends GameObject {
  hits: number;
  hitsMax: number;
  my: boolean;
}

export interface StructureSpawn extends Structure {
  spawnCreep(body: BodyPartConstant[]): { object?: Creep; error: number };
}

export interface OwnedStructure extends Structure {
  my: boolean;
}

// Constructor types for use with getObjectsByPrototype
// These are declared as const variables since they will be provided by the Screeps Arena runtime
// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any
export const Creep: new () => Creep = null as any;
// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any
export const Structure: new () => Structure = null as any;
// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any
export const StructureSpawn: new () => StructureSpawn = null as any;
