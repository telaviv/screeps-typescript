import roleBuilder, { Builder } from 'roles/builder'
import roleHarvester from 'roles/harvester'
import roleUpgrader, { Upgrader } from 'roles/upgrader'
import { ErrorMapper } from 'utils/ErrorMapper'
import { runSpawn } from './spawn'
import { runTower } from './tower'

function unwrappedLoop() {
    console.log(`Current game tick is ${Game.time}`)

    Object.values(Game.rooms).forEach(room => {
        if (room.controller && room.controller.my) {
            const structures: Structure[] = room.find(FIND_MY_STRUCTURES, {
                filter: s => {
                    return (
                        s.structureType === STRUCTURE_TOWER ||
                        s.structureType === STRUCTURE_SPAWN
                    )
                },
            }) as any

            for (const structure of structures) {
                if (structure.structureType === STRUCTURE_TOWER) {
                    runTower(structure as StructureTower)
                } else if (structure.structureType === STRUCTURE_SPAWN) {
                    runSpawn(structure as StructureSpawn)
                }
            }
        }
    })

    for (const name in Game.creeps) {
        const creep = Game.creeps[name]
        if (creep.memory.role === 'harvester') {
            roleHarvester.run(creep)
        }
        if (creep.memory.role === 'upgrader') {
            roleUpgrader.run(creep as Upgrader)
        }
        if (creep.memory.role === 'builder') {
            roleBuilder.run(creep as Builder)
        }
    }

    // Automatically delete memory of missing creeps
    for (const name in Memory.creeps) {
        if (!(name in Game.creeps)) {
            delete Memory.creeps[name]
        }
    }
}

// When compiling TS to JS and bundling with rollup, the line numbers and file names in error messages change
// This utility uses source maps to get the line numbers and file names of the original, TS source code
const loop = ErrorMapper.wrapLoop(unwrappedLoop)

export { loop, unwrappedLoop }
