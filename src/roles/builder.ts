import { getNextSource, getEnergy } from 'utils'

export interface Builder extends SourceCreep {
    memory: BuilderMemory
}

interface BuilderMemory extends SourceMemory {
    building: boolean
    role: 'builder'
}

const ROLE = 'builder'

const roleBuilder = {
    run(creep: Builder) {
        if (
            creep.memory.building &&
            creep.store.getCapacity() === creep.store.getFreeCapacity()
        ) {
            creep.memory.building = false
            creep.say('🔄 harvest')
        }
        if (!creep.memory.building && creep.store.getFreeCapacity() === 0) {
            creep.memory.building = true
            creep.say('🚧 build')
        }

        if (creep.memory.building) {
            const targets = creep.room.find(FIND_CONSTRUCTION_SITES)
            if (targets.length) {
                if (creep.build(targets[0]) === ERR_NOT_IN_RANGE) {
                    creep.moveTo(targets[0], {
                        visualizePathStyle: { stroke: '#ffffff' },
                    })
                }
            }
        } else {
            getEnergy(creep)
        }
    },

    create(spawn: StructureSpawn): number {
        return spawn.spawnCreep([WORK, CARRY, MOVE], `${ROLE}:${Game.time}`, {
            memory: {
                role: ROLE,
                source: getNextSource(spawn.room, ROLE),
            } as BuilderMemory,
        })
    },
}

export default roleBuilder
