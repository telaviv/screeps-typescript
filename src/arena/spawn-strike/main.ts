import { ATTACK, ERR_NOT_IN_RANGE, MOVE } from 'game/constants';
import { Creep, StructureSpawn } from 'game/prototypes';
import { getObjectsByPrototype } from 'game/utils';

const mySpawn = getObjectsByPrototype(StructureSpawn).find(spawn => spawn.my);
const enemySpawn = getObjectsByPrototype(StructureSpawn).find(spawn => !spawn.my);
var creep: Creep | undefined;

export function loop(): void {
  if (!mySpawn || !enemySpawn) {
    return;
  }

  if (!creep) {
    creep = mySpawn.spawnCreep([ATTACK, ATTACK, MOVE, MOVE]).object;
  }

  if (creep && creep.attack(enemySpawn) === ERR_NOT_IN_RANGE) {
    creep.moveTo(enemySpawn);
  }
}
