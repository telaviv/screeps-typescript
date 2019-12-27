export interface Upgrader extends Creep {
    memory: UpgraderMemory
}

interface UpgraderMemory extends CreepMemory {
    role: 'upgrader'
    upgrading: boolean
}

const roleUpgrader = {
    run(creep: Upgrader) {
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
            const sources = creep.room.find(FIND_SOURCES)
            if (creep.harvest(sources[0]) === ERR_NOT_IN_RANGE) {
                creep.moveTo(sources[0], {
                    visualizePathStyle: { stroke: '#ffaa00' },
                })
            }
        }
    },

    create(spawn: StructureSpawn): number {
        const role = 'upgrader'
        return spawn.spawnCreep([WORK, CARRY, MOVE], `${role}:${Game.time}`, {
            memory: { role },
        })
    },
}

export default roleUpgrader
