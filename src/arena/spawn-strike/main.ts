import { ATTACK, ERR_NOT_IN_RANGE, MOVE } from 'game/constants'
import { Creep, StructureSpawn } from 'game/prototypes'
import { getObjectsByPrototype } from 'game/utils'

const mySpawn = getObjectsByPrototype(StructureSpawn).find((spawn) => spawn.my)
const enemySpawn = getObjectsByPrototype(StructureSpawn).find((spawn) => !spawn.my)

const creeps: Creep[] = []
let time = 0
export function loop(): void {
    time++
    if (!mySpawn || !enemySpawn) {
        return
    }

    const ncreep = mySpawn.spawnCreep([ATTACK, ATTACK, MOVE, MOVE]).object
    if (ncreep) {
        creeps.push(ncreep)
    }
    for (const creep of creeps) {
        if (creep && creep.attack(enemySpawn) === ERR_NOT_IN_RANGE) {
            creep.moveTo(enemySpawn)
        }
    }
}
