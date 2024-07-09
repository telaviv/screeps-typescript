import * as TaskRunner from 'tasks/runner'
import * as TimeCache from 'utils/time-cache'
import { recordGameStats, recordRoomStats } from 'utils/stats'
import roleAttacker, { Attacker } from 'roles/attacker'
import roleClaimer, { Claimer } from 'roles/claim'
import roleHarvester, { Harvester } from 'roles/harvester'
import roleMason, { Mason } from 'roles/mason'
import roleRemoteBuild, { RemoteBuild } from 'roles/remote-build'
import roleRemoteUpgrade, { RemoteUpgrade } from 'roles/remote-upgrade'
import roleScout, { Scout } from 'roles/scout'
import roleStaticLinkHauler, { StaticLinkHauler } from 'roles/static-link-hauler'
import roleStaticUpgrader, { StaticUpgrader } from 'roles/static-upgrader'
import roleWrecker, { Wrecker } from 'roles/wrecker'
import survey, { isSurveyComplete } from './surveyor'
import updateStrategy, { StrategyPhase } from './strategy'
import Empire from 'empire'
import ErrorMapper from 'utils/ErrorMapper'
import LinkManager from 'managers/link-manager'
import { LogisticsCreep } from 'roles/logistics-constants'
import RoleLogistics from 'roles/logistics'
import RoomVisualizer from 'room-visualizer'
import { ScoutManager } from 'managers/scout-manager'
import assignGlobals from 'utils/globals'
import { getBuildManager } from 'managers/build-manager'
import migrate from 'migrations'
import { runSpawn } from './spawn'
import { runTower } from './tower'
import { wrap } from 'utils/profiling'

declare global {
    /*
      Example types, expand on these or remove them and add your own.
      Note: Values, properties defined here do no fully *exist* by this type definiton alone.
            You must also give them an implemention if you would like to use them. (ex. actually setting a `role` property in a Creeps memory)

      Types added in this `global` block are in an ambient, global context. This is needed because `main.ts` is a module file (uses import or export).
      Interfaces matching on name from @types/screeps will be merged. This is how you can extend the 'built-in' interfaces from @types/screeps.
    */
    // Memory extension samples
    // eslint-disable-next-line @typescript-eslint/no-empty-interface
    interface Memory {}

    interface RoomMemory {
        strategy: StrategyPhase
        collapsed: boolean
        visuals: { snapshot: boolean }
        updated: number
    }

    interface CreepMemory {
        role: string
        home: string | undefined
    }

    // Syntax for adding proprties to `global` (ex "global.log")
    namespace NodeJS {
        // eslint-disable-next-line @typescript-eslint/no-empty-interface
        interface Global {
            USERNAME: string
        }
    }
}

assignGlobals()
migrate()

if (!Memory.creeps) {
    Memory.creeps = {}
}

const clearMemory = wrap(() => {
    for (const name in Memory.creeps) {
        if (!(name in Game.creeps)) {
            delete Memory.creeps[name]
        }
    }
    TimeCache.clearAll()
}, 'main:clearMemory')

const runMyRoom = wrap((room: Room) => {
    recordRoomStats(room)
    const buildManager = getBuildManager(room)
    if (!buildManager) {
        return
    }
    buildManager.removeEnemyConstructionSites()
    buildManager.ensureConstructionSites()
    ensureSafeMode(room)

    const linkManager = LinkManager.createFromRoom(room)
    if (linkManager) {
        linkManager.run()
    }
    const structures: Structure[] = room.find(FIND_MY_STRUCTURES, {
        filter: (s) => {
            return s.structureType === STRUCTURE_TOWER || s.structureType === STRUCTURE_SPAWN
        },
    })

    for (const structure of structures) {
        if (structure.structureType === STRUCTURE_TOWER) {
            runTower(structure as StructureTower)
        } else if (structure.structureType === STRUCTURE_SPAWN) {
            runSpawn(structure as StructureSpawn)
        }
    }
}, 'main:runMyRoom')

const ensureSafeMode = wrap((room: Room) => {
    if (!room.controller || !room.controller.safeModeAvailable) {
        return
    }
    for (const event of room.getEventLog()) {
        if (event.event === EVENT_OBJECT_DESTROYED && event.data.type === STRUCTURE_RAMPART) {
            room.controller.activateSafeMode()
            return
        }
    }
}, 'ensureSafeMode')

const runCreep = wrap((creepName: string) => {
    const creep = Game.creeps[creepName]
    if (creep.memory.role === 'harvester') {
        roleHarvester.run(creep as unknown as Harvester)
    } else if (creep.memory.role === 'logistics') {
        RoleLogistics.staticRun(creep as LogisticsCreep)
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
    } else if (creep.memory.role === 'static-link-hauler') {
        roleStaticLinkHauler.run(creep as StaticLinkHauler)
    } else if (creep.memory.role === 'static-upgrader') {
        roleStaticUpgrader.run(creep as StaticUpgrader)
    }
}, 'main:runCreep')

const initialize = wrap(() => {
    clearMemory()
    ScoutManager.create().run()
    const empire = new Empire()
    empire.run()
    survey()
    TaskRunner.cleanup()
}, 'main:initialize')

const runAllRooms = wrap(() => {
    Object.values(Game.rooms).forEach((room) => {
        room.memory.updated = Game.time

        const visualizer = RoomVisualizer.create(room)
        if (visualizer) {
            visualizer.render()
        }

        updateStrategy(room)

        if (room.controller && room.controller.my && isSurveyComplete(room)) {
            runMyRoom(room)
        }
    })
}, 'main:runAllRooms')

const runAllCreeps = wrap(() => {
    for (const name of Object.keys(Game.creeps)) {
        runCreep(name)
    }
}, 'main:runAllCreeps')

function unwrappedLoop(): void {
    initialize()
    runAllRooms()
    runAllCreeps()
    recordGameStats()
}

// When compiling TS to JS and bundling with rollup, the line numbers and file names in error messages change
// This utility uses source maps to get the line numbers and file names of the original, TS source code

const loop = wrap(
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore : global trickery in tests
    !global.Game || global.Game.cpu.tickLimit < 30
        ? unwrappedLoop
        : ErrorMapper.wrap(unwrappedLoop),
    'main:loop',
)

export { loop, unwrappedLoop }
