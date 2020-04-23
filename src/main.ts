import RoomVisualizer from 'room-visualizer'
import roleHarvester, { Harvester } from 'roles/harvester'
import roleLogistics from 'roles/logistics'
import roleClaimer, { Claimer } from 'roles/claim'
import { Logistics } from 'roles/logistics-constants'
import ErrorMapper from 'utils/ErrorMapper'
import * as Logger from 'utils/logger'
import * as Profiler from 'utils/profiling'
import assignGlobals from 'utils/globals'
import { recordRoomStats, recordGameStats } from 'utils/stats'
import DroppedEnergyManager from 'managers/dropped-energy-manager'
import EnergySinkManager from 'managers/energy-sink-manager'

import { runSpawn } from './spawn'
import updateStrategy from './strategy'
import survey from './surveyor'
import { runTower } from './tower'

global.Profiler = Profiler
assignGlobals()

if (!Memory.tasks) {
    Memory.tasks = []
}

function unwrappedLoop() {
    // Automatically delete memory of missing creeps
    for (const name in Memory.creeps) {
        if (!(name in Game.creeps)) {
            delete Memory.creeps[name]
        }
    }

    const energySinkManager = EnergySinkManager.get()
    energySinkManager.cleanup()
    survey()

    Object.values(Game.rooms).forEach(room => {
        room.memory.constructing = false
        if (!room.memory.snapshot) {
            room.memory.snapshot = []
        }

        Logger.debug('not sure what to do here')

        const visualizer = new RoomVisualizer(room)
        visualizer.render()

        for (const source of room.memory.sources) {
            const droppedEnergy = DroppedEnergyManager.get(source.dropSpot)
            droppedEnergy.cleanup()
        }

        updateStrategy(room)

        if (room.controller && room.controller.my) {
            recordRoomStats(room)

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
        } else if (creep.memory.role === 'claimer') {
            roleClaimer.run(creep as Claimer)
        }
    }
    recordGameStats()
}

// When compiling TS to JS and bundling with rollup, the line numbers and file names in error messages change
// This utility uses source maps to get the line numbers and file names of the original, TS source code
const loop = ErrorMapper.wrapLoop(unwrappedLoop)

export { loop, unwrappedLoop }
