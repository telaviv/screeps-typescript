import * as Logger from 'utils/logger'
import * as TaskRunner from 'tasks/runner'
import * as TimeCache from 'utils/time-cache'
import assignGlobals, { findUsername } from 'utils/globals'
import { recordGameStats, recordRoomStats } from 'utils/stats'
import roleAttacker, { Attacker } from 'roles/attacker'
import roleClaimer, { Claimer } from 'roles/claim'
import roleEnergyHauler, { EnergyHauler } from 'roles/energy-hauler'
import roleHarvester, { Harvester } from 'roles/harvester'
import roleHealer, { Healer } from 'roles/healer'
import roleMason, { Mason } from 'roles/mason'
import roleRebalancer, { Rebalancer } from 'roles/rebalancer'
import roleRemoteHauler, { RemoteHauler } from 'roles/remote-hauler'
import roleRemoteUpgrade, { RemoteWorker } from 'roles/remote-worker'
import roleScout, { Scout } from 'roles/scout'
import roleStaticLinkHauler, { StaticLinkHauler } from 'roles/static-link-hauler'
import roleStaticUpgrader, { StaticUpgrader } from 'roles/static-upgrader'
import roleWrecker, { Wrecker } from 'roles/wrecker'
import survey, { isSurveyComplete } from './surveyor'
import { trackProfiler, wrap } from 'utils/profiling'
import updateStrategy, { StrategyPhase } from './strategy'
import Empire from 'empire'
import ErrorMapper from 'utils/ErrorMapper'
import { HostileRecorder } from 'hostiles'
import LinkManager from 'managers/link-manager'
import { LogisticsCreep } from 'roles/logistics-constants'
import { MatrixCacheManager } from 'matrix-cache'
import { MineDecider } from 'managers/mine-manager'
import RoleLogistics from 'roles/logistics'
import { ScoutManager } from 'managers/scout-manager'
import { World } from 'utils/world'
import { clearImmutableRoomCache } from 'utils/immutable-room'
import { ensureSlidingWindow } from 'room-window'
import { getBuildManager } from 'managers/build-manager'
import { hasHostileCreeps } from 'utils/room'
import migrate from 'migrations'
import { runSpawn } from './spawn'
import { runTower } from './tower'
import { visualize } from 'room-visualizer'

if (!global.USERNAME) {
    global.USERNAME = findUsername()
}

if (Game.time === 0) {
    MineDecider.create().assignMines()
}

// cpu mins
const VISUALS_CPU_MIN = 1000

declare global {
    /*
      Example types, expand on these or remove them and add your own.
      Note: Values, properties defined here do no fully *exist* by this type definition alone.
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

const CREEP_MEMORY_TIMEOUT = 500

const clearCreepMemory = wrap(() => {
    if (Game.time % CREEP_MEMORY_TIMEOUT !== 0) {
        return
    }
    for (const name in Memory.creeps) {
        if (!Game.creeps[name]) {
            delete Memory.creeps[name]
        }
    }
}, 'main:clearCreepMemory')

const runMyRoom = wrap((room: Room) => {
    recordRoomStats(room)
    ensureSlidingWindow(room)
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
    if (Memory.miningEnabled) {
        for (const mine of room.memory.mines ?? []) {
            runMine(mine.name)
        }
    }
}, 'main:runMyRoom')

const runMine = wrap((mineName: string) => {
    const room = Game.rooms[mineName]
    if (!room) {
        return
    }
    ensureSlidingWindow(room)
    const buildManager = getBuildManager(room)
    if (!buildManager) {
        return
    }
    buildManager.removeEnemyConstructionSites()
    buildManager.ensureMineConstructionSites()
}, 'main:runMine')

const ensureSafeMode = wrap((room: Room) => {
    if (!room.controller || !room.controller.safeModeAvailable) {
        return
    }
    for (const event of room.getEventLog()) {
        if (event.event === EVENT_OBJECT_DESTROYED) {
            if (event.data.type !== 'creep') {
                if (!hasHostileCreeps(room)) {
                    continue
                }
                const err = room.controller.activateSafeMode()
                Logger.error(
                    `ensure safe mode for ${room.name}: ${event.data.type} destroyed.`,
                    err,
                )
            }
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
    } else if (creep.memory.role === 'remote-worker') {
        roleRemoteUpgrade.run(creep as RemoteWorker)
    } else if (creep.memory.role === 'mason') {
        roleMason.run(creep as Mason)
    } else if (creep.memory.role === 'static-link-hauler') {
        roleStaticLinkHauler.run(creep as StaticLinkHauler)
    } else if (creep.memory.role === 'static-upgrader') {
        roleStaticUpgrader.run(creep as StaticUpgrader)
    } else if (creep.memory.role === 'healer') {
        roleHealer.run(creep as Healer)
    } else if (creep.memory.role === 'rebalancer') {
        roleRebalancer.run(creep as Rebalancer)
    } else if (creep.memory.role === 'energy-hauler') {
        roleEnergyHauler.run(creep as EnergyHauler)
    } else if (creep.memory.role === 'remote-hauler') {
        roleRemoteHauler.run(creep as RemoteHauler)
    }
}, 'main:runCreep')

const initialize = wrap(() => {
    if (!global.USERNAME) {
        global.USERNAME = findUsername()
    }

    clearCreepMemory()
    ScoutManager.create().run()
    clearImmutableRoomCache()
    addSubscriptions()
    const empire = new Empire()
    empire.run()
    survey()
    TaskRunner.cleanup()
}, 'main:initialize')

const addSubscriptions = wrap(() => {
    MatrixCacheManager.addSubscriptions()
}, 'main:addSubscriptions')

const runAllRooms = wrap(() => {
    Object.values(Game.rooms).forEach((room) => {
        room.memory.updated = Game.time
        updateStrategy(room)
        const hostileRecorder = new HostileRecorder(room.name)
        hostileRecorder.record()
        if (room.controller && room.controller.my && isSurveyComplete(room)) {
            runMyRoom(room)
        }
    })
}, 'main:runAllRooms')

const runAllCreeps = () => {
    for (const name of Object.keys(Game.creeps)) {
        runCreep(name)
    }
}

function unwrappedLoop(): void {
    initialize()
    runAllRooms()
    runAllCreeps()
    recordGameStats()
    World.clearClosestRoomCache()
    MatrixCacheManager.clearCaches()
    TimeCache.clearAll()
    trackProfiler()

    if (Game.cpu.bucket === 10000 && Game.cpu.generatePixel) {
        Game.cpu.generatePixel()
        Logger.warning('PIXEL generated')
    }

    if (Game.cpu.bucket >= VISUALS_CPU_MIN) {
        visualize()
    }
}

// When compiling TS to JS and bundling with rollup, the line numbers and file names in error messages change
// This utility uses source maps to get the line numbers and file names of the original, TS source code

// const pretickProfiled = wrap(preTick, 'main:preTick')
// const reconcileTrafficProfiled = wrap(reconcileTraffic, 'main:reconcileTraffic')

const loop = wrap(() => {
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore : global trickery in tests
    // pretickProfiled()
    if (!global.Game || global.Game.cpu.tickLimit < 30) {
        unwrappedLoop()
    } else {
        ErrorMapper.wrap(unwrappedLoop)()
    }
    // reconcileTrafficProfiled()
}, 'main:loop')

export { loop, unwrappedLoop }
