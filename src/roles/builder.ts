import {
    getNextSource,
    getEnergy,
    hasNoEnergy,
    isFullOfEnergy,
} from 'utils/energy-harvesting'
import { wrap } from 'utils/profiling'
import BuildManager from 'build-manager'

export interface Builder extends SourceCreep {
    memory: BuilderMemory
}

interface BuilderMemory extends SourceMemory {
    building: boolean
    role: 'builder'
}

const ROLE = 'builder'

const roleBuilder = {
    run: wrap((creep: Builder) => {
        if (creep.memory.building && hasNoEnergy(creep)) {
            creep.memory.building = false
            creep.say('🔄 harvest')
        }
        if (!creep.memory.building && isFullOfEnergy(creep)) {
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
            } else if (isFullOfEnergy(creep)) {
                const buildManager = new BuildManager(creep.room)
                buildManager.createConstructionSite()
            }
        } else {
            getEnergy(creep)
        }
    }, 'runBuilder'),

    create(spawn: StructureSpawn): number {
        return spawn.spawnCreep(
            [WORK, CARRY, MOVE, MOVE],
            `${ROLE}:${Game.time}`,
            {
                memory: {
                    role: ROLE,
                    source: getNextSource(spawn.room, ROLE),
                } as BuilderMemory,
            },
        )
    },
}

export default roleBuilder
