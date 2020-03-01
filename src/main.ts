import roleBuilder, { Builder } from 'roles/builder'
import roleHarvester, { Harvester } from 'roles/harvester'
import roleLogistics, { Logistics } from 'roles/logistics'
import roleUpgrader, { Upgrader } from 'roles/upgrader'
import ErrorMapper from 'utils/ErrorMapper'
import { runSpawn } from './spawn'
import updateStrategy from './strategy'
import survey from './surveyor'
import { runTower } from './tower'
import DroppedEnergy from './dropped-energy'

function unwrappedLoop() {
    survey()

    Object.values(Game.rooms).forEach(room => {
        for (let i = 0; i < room.memory.sources.length; ++i) {
            const droppedEnergy = new DroppedEnergy(room.name, i)
            droppedEnergy.cleanup()
        }

        updateStrategy(room)

        if (room.controller && room.controller.my) {
            const structures: Structure[] = room.find(FIND_MY_STRUCTURES, {
                filter: s => {
                    return (
                        s.structureType === STRUCTURE_TOWER ||
                        s.structureType === STRUCTURE_SPAWN
                    )
                },
            })

            for (const structure of structures) {
                if (structure.structureType === STRUCTURE_TOWER) {
                    runTower(structure as StructureTower)
                } else if (structure.structureType === STRUCTURE_SPAWN) {
                    runSpawn(structure as StructureSpawn)
                }
            }
        }
    })

    for (const name of Object.keys(Game.creeps)) {
        const creep = Game.creeps[name]
        if (creep.memory.role === 'harvester') {
            roleHarvester.run(creep as Harvester)
        } else if (creep.memory.role === 'logistics') {
            roleLogistics.run(creep as Logistics)
        } else if (creep.memory.role === 'upgrader') {
            roleUpgrader.run(creep as Upgrader)
        } else if (creep.memory.role === 'builder') {
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
