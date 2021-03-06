import migrate from 'migrations'
import RoomVisualizer from 'room-visualizer'
import WarDepartment from 'war-department'
import roleHarvester, { Harvester } from 'roles/harvester'
import roleLogistics from 'roles/logistics'
import roleClaimer, { Claimer } from 'roles/claim'
import roleWrecker, { Wrecker } from 'roles/wrecker'
import roleAttacker, { Attacker } from 'roles/attacker'
import roleRemoteBuild, { RemoteBuild } from 'roles/remote-build'
import roleRemoteUpgrade, { RemoteUpgrade } from 'roles/remote-upgrade'
import roleMason, { Mason } from 'roles/mason'
import roleScout, { Scout } from 'roles/scout'
import { LogisticsCreep } from 'roles/logistics-constants'
import ErrorMapper from 'utils/ErrorMapper'
import * as Profiler from 'utils/profiling'
import assignGlobals from 'utils/globals'
import { recordRoomStats, recordGameStats } from 'utils/stats'
import * as TaskRunner from 'tasks/runner'
import BuildManager from 'managers/build-manager'

import { runSpawn } from './spawn'
import updateStrategy from './strategy'
import survey from './surveyor'
import { runTower } from './tower'

global.Profiler = Profiler
assignGlobals()
migrate()

if (!Memory.creeps) {
    Memory.creeps = {}
}

function unwrappedLoop() {
    // Automatically delete memory of missing creeps
    for (const name in Memory.creeps) {
        if (!(name in Game.creeps)) {
            delete Memory.creeps[name]
        }
    }

    survey()
    TaskRunner.cleanup()

    Object.values(Game.rooms).forEach(room => {
        if (!room.memory.snapshot) {
            room.memory.snapshot = []
        }

        const visualizer = new RoomVisualizer(room)
        visualizer.render()

        updateStrategy(room)

        if (room.controller && room.controller.my) {
            recordRoomStats(room)

            BuildManager.get(room).ensureConstructionSites()

            const warDepartment = new WarDepartment(room)
            warDepartment.update()

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
            roleLogistics.run(creep as LogisticsCreep)
        } else if (creep.memory.role === 'claimer') {
            roleClaimer.run(creep as Claimer)
        } else if (creep.memory.role === 'wrecker') {
            roleWrecker.run(creep as Wrecker)
        } else if (creep.memory.role === 'attack') {
            roleAttacker.run(creep as Attacker)
        } else if (creep.memory.role === 'scout') {
            roleScout.run(creep as Scout)
        } else if (creep.memory.role === 'remote-upgrade') {
            roleRemoteUpgrade.run(creep as RemoteUpgrade)
        } else if (creep.memory.role === 'remote-build') {
            roleRemoteBuild.run(creep as RemoteBuild)
        } else if (creep.memory.role === 'mason') {
            roleMason.run(creep as Mason)
        }
    }
    recordGameStats()
}

// When compiling TS to JS and bundling with rollup, the line numbers and file names in error messages change
// This utility uses source maps to get the line numbers and file names of the original, TS source code
const loop = ErrorMapper.wrapLoop(unwrappedLoop)

export { loop, unwrappedLoop }
