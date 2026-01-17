import { GameObject } from './prototypes';

export function getObjectsByPrototype<T extends GameObject>(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars, @typescript-eslint/no-explicit-any
  prototype: new (...args: any[]) => T
): T[] {
  // This is a stub - actual implementation is provided by the Screeps Arena runtime
  return [] as T[];
}

export function findClosestByPath<T extends GameObject>(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  position: { x: number; y: number },
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  objects: T[]
): T | null {
  // This is a stub - actual implementation is provided by the Screeps Arena runtime
  return null;
}

export function findClosestByRange<T extends GameObject>(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  position: { x: number; y: number },
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  objects: T[]
): T | null {
  // This is a stub - actual implementation is provided by the Screeps Arena runtime
  return null;
}

export function findInRange<T extends GameObject>(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  position: { x: number; y: number },
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  objects: T[],
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  range: number
): T[] {
  // This is a stub - actual implementation is provided by the Screeps Arena runtime
  return [] as T[];
}

export function getRange(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  a: { x: number; y: number },
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  b: { x: number; y: number }
): number {
  // This is a stub - actual implementation is provided by the Screeps Arena runtime
  return 0;
}
