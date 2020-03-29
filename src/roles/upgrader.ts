import { getNextSource, getEnergy } from 'utils/energy-harvesting'
import { wrap } from 'utils/profiling'

const ROLE = 'upgrader'

export interface Upgrader extends SourceCreep {
    memory: UpgraderMemory
}

interface UpgraderMemory extends SourceMemory {
    role: 'upgrader'
    upgrading: boolean
}

const roleUpgrader = {
    run: wrap((creep: Upgrader) => {
        if (creep.memory.upgrading && creep.store[RESOURCE_ENERGY] === 0) {
            creep.memory.upgrading = false
            creep.say('🔄 harvest')
        }
        if (!creep.memory.upgrading && creep.store.getFreeCapacity() === 0) {
            creep.memory.upgrading = true
            creep.say('⚡ upgrade')
        }

        if (creep.memory.upgrading) {
            if (creep.room.controller) {
                if (
                    creep.upgradeController(creep.room.controller) ===
                    ERR_NOT_IN_RANGE
                ) {
                    creep.moveTo(creep.room.controller, {
                        visualizePathStyle: { stroke: '#ffffff' },
                    })
                }
            }
        } else {
            getEnergy(creep)
        }
    }, 'runUpgrader'),

    create(spawn: StructureSpawn): number {
        return spawn.spawnCreep(
            [WORK, CARRY, MOVE, MOVE],
            `${ROLE}:${Game.time}`,
            {
                memory: {
                    role: ROLE,
                    source: getNextSource(spawn.room, ROLE),
                } as UpgraderMemory,
            },
        )
    },
}

export default roleUpgrader
