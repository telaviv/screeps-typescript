import * as Logger from 'utils/logger'
import { resetSnapshot, saveSnapshot } from 'snapshot'
import { RoomManager } from 'managers/room-manager'
import { Task } from 'tasks/types'
import { canMine } from 'managers/mine-manager'
import { findMyRooms } from './room'
import { getAllTasks } from 'tasks/utils'
import { getConstructionFeaturesV3 } from 'construction-features'
import { LogisticsCreep } from 'roles/logistics-constants'

import ErrorMapper from './ErrorMapper'
import Empire from 'empire'
import roleWrecker from 'roles/wrecker'
import WarDepartment from 'war-department'

function killAllCreeps(roomName: string) {
    Object.values(Game.creeps).forEach((creep) => {
        if (creep.room.name === roomName) {
            creep.suicide()
        }
    })
}

function claimRoom(destination: string, startRoom: string) {
    const room = Game.rooms[startRoom]
    if (!room) {
        throw Error(`Couldn't find room ${startRoom}`)
    }
    const roomManager = new RoomManager(Game.rooms[startRoom])
    roomManager.addClaimRoomTask(destination)
    Logger.info('claimRoom:success', destination)
}

function sendWrecker(endRoom: string, startRoom: string) {
    const spawns = Game.rooms[startRoom].find(FIND_MY_SPAWNS)
    if (spawns.length === 0) {
        throw new Error('no spawn in starting room')
    }
    const err = roleWrecker.create(spawns[0], endRoom)
    Logger.info('sendWrecker:create', err)
}

function declareWar(endRoom: string, warRoom: string) {
    const warDepartment = new WarDepartment(Game.rooms[warRoom])
    warDepartment.declareWar(endRoom)
}

function cancelWar(warRoom: string) {
    const warDepartment = new WarDepartment(Game.rooms[warRoom])
    warDepartment.cancelWar()
}

function pauseConstruction(room: string) {
    Game.rooms[room].memory.construction.paused = true
}

function unpauseConstruction(room: string) {
    Game.rooms[room].memory.construction.paused = false
}

function printTasks(type?: Task<any>) {
    for (const task of getAllTasks()) {
        if (type && task !== type) {
            continue
        }
        console.log(JSON.stringify(task))
    }
}

function debugRoom(roomName: string) {
    console.log(`=== Debug Room: ${roomName} ===`)

    // Construction features
    const features = getConstructionFeaturesV3(roomName)
    console.log(`Construction Features Type: ${features?.type ?? 'none'}`)

    // Claim candidates
    const empire = new Empire()
    const candidates = empire.findClaimCandidates()
    console.log(`Is Claim Candidate: ${candidates.includes(roomName)}`)
    console.log(`All Claim Candidates: ${candidates.join(', ')}`)

    // GCL status
    const myRoomsCount = findMyRooms().length
    console.log(`GCL Level: ${Game.gcl.level}, My Rooms: ${myRoomsCount}`)
    console.log(`At GCL Cap: ${myRoomsCount >= Game.gcl.level}`)

    // Can mine check
    console.log(`canMine: ${canMine(roomName)}`)

    // Scout data
    const scout = Memory.rooms[roomName]?.scout
    console.log(`Scout Data:`)
    console.log(`  - Owner: ${scout?.controllerOwner ?? 'none'}`)
    console.log(`  - Enemy Mining: ${scout?.enemyThatsMining ?? 'none'}`)
    console.log(`  - Controller Pos: ${scout?.controllerPosition ? 'yes' : 'no'}`)

    // Mining assignment
    const mines = Object.entries(Memory.rooms)
        .filter(([, mem]) => mem.mines?.some((m) => m.name === roomName))
        .map(([name]) => name)
    console.log(`Assigned as mine to: ${mines.length > 0 ? mines.join(', ') : 'none'}`)
}

function showClaimTasks() {
    const claimTasks = RoomManager.getAllClaimTasks()
    if (claimTasks.length === 0) {
        console.log('No claim tasks found.')
        return
    }
    console.log(`=== Claim Tasks (${claimTasks.length}) ===`)
    claimTasks.forEach((task) => {
        console.log(JSON.stringify(task))
    })
}

/**
 * Debugs why mine logistics workers aren't switching tasks
 * @param roomName - The mine room name to check
 */
function debugMineWorkers(roomName: string) {
    console.log(`=== Debug Mine Workers: ${roomName} ===`)

    const room = Game.rooms[roomName]
    if (!room) {
        console.log('ERROR: Room not visible')
        return
    }

    // Find mine logistics workers in this room
    const workers = Object.values(Game.creeps).filter(
        (creep) =>
            creep.memory.role === 'logistics' &&
            creep.memory.home === roomName &&
            creep.room.name === roomName,
    ) as LogisticsCreep[]

    console.log(`\n--- Workers (${workers.length}) ---`)
    if (workers.length === 0) {
        console.log('No logistics workers found in this mine!')
        return
    }

    workers.forEach((creep) => {
        console.log(`\nCreep: ${creep.name}`)
        console.log(`  Position: ${creep.pos}`)
        console.log(`  Preference: ${creep.memory.preference}`)
        console.log(`  Current Task: ${creep.memory.currentTask}`)
        console.log(`  Energy: ${creep.store.energy}/${creep.store.getCapacity()}`)
        console.log(`  Tasks Queue: ${creep.memory.tasks.length} items`)
        console.log(`  Idle Time: ${Game.time - (creep.memory.idleTimestamp || Game.time)}`)
    })

    // Check room conditions
    console.log(`\n--- Room Conditions ---`)

    // Construction sites
    const sites = room.find(FIND_CONSTRUCTION_SITES)
    const nonWallSites = sites.filter(
        (s) => s.structureType !== STRUCTURE_WALL && s.structureType !== STRUCTURE_RAMPART,
    )
    console.log(`Construction Sites: ${sites.length} (${nonWallSites.length} non-wall)`)

    // Repairable structures
    const MIN_REPAIR_THRESHOLD = 0.66
    const repairableStructures = room.find(FIND_STRUCTURES, {
        filter: (s) => {
            if (s.structureType === STRUCTURE_WALL || s.structureType === STRUCTURE_RAMPART) {
                return false
            }
            return s.hits / s.hitsMax < MIN_REPAIR_THRESHOLD
        },
    })
    console.log(`Repairable Structures: ${repairableStructures.length}`)
    if (repairableStructures.length > 0) {
        repairableStructures.forEach((s) => {
            console.log(
                `  - ${s.structureType} at ${s.pos}: ${s.hits}/${s.hitsMax} (${(
                    (s.hits / s.hitsMax) *
                    100
                ).toFixed(1)}%)`,
            )
        })
    }

    // Check specific conditions from assignWorkerPreference
    console.log(`\n--- Task Assignment Conditions ---`)
    console.log(`Has No Spawns: ${!room.find(FIND_MY_SPAWNS).length}`)
    console.log(`Has SafeMode: ${!!room.controller?.safeMode}`)
    console.log(`Controller Downgrade: ${room.controller?.ticksToDowngrade ?? 'N/A'} ticks`)

    // Check fragile walls
    const fragileWalls = room.find(FIND_STRUCTURES, {
        filter: (s) => {
            if (s.structureType !== STRUCTURE_WALL && s.structureType !== STRUCTURE_RAMPART) {
                return false
            }
            return s.hits < 10000
        },
    })
    console.log(`Fragile Walls (<10k hits): ${fragileWalls.length}`)

    console.log(`\n--- Task Priority Order ---`)
    console.log(`1. Travel (if not in home)`)
    console.log(`2. Upgrade (if controller downgrade < 5000)`)
    console.log(`3. Build (if no spawns)`)
    console.log(`4. Haul (if no energy hauler and can transfer)`)
    console.log(`5. Wall Repairs (if no safe mode and fragile walls)`)
    console.log(`6. Build (if non-wall construction sites exist)`)
    console.log(`7. Wall Repairs (if safe mode and fragile walls)`)
    console.log(`8. Repair (if repairable non-walls exist)`)
    console.log(`9. Upgrade (default fallback)`)
}

/**
 * Debugs a single worker to see why it's not working
 * @param creepName - The name of the creep to debug
 */
function debugWorker(creepName: string) {
    const creep = Game.creeps[creepName] as LogisticsCreep
    if (!creep) {
        console.log(`ERROR: Creep ${creepName} not found`)
        return
    }

    console.log(`=== Debug Worker: ${creepName} ===`)
    console.log(`Position: ${creep.pos}`)
    console.log(`Home: ${creep.memory.home}`)
    console.log(`Current Room: ${creep.room.name}`)
    console.log(`Preference: ${creep.memory.preference}`)
    console.log(`Current Task: ${creep.memory.currentTask}`)
    console.log(`Energy: ${creep.store.energy}/${creep.store.getCapacity()}`)
    console.log(`Tasks Queue: ${creep.memory.tasks.length} items`)
    console.log(`Idle Time: ${Game.time - (creep.memory.idleTimestamp || Game.time)} ticks`)
    console.log(`TTL: ${creep.ticksToLive}`)

    const room = creep.room
    const homeRoom = Game.rooms[creep.memory.home]
    console.log(`\n--- Room Status: ${room.name} ---`)
    console.log(`Has Controller: ${!!room.controller}`)
    console.log(`Controller Owner: ${room.controller?.owner?.username ?? 'none'}`)
    console.log(`Controller My: ${!!room.controller?.my}`)

    if (homeRoom) {
        console.log(`\n--- Home Room Status: ${homeRoom.name} ---`)
        console.log(`Home Has Controller: ${!!homeRoom.controller}`)
        console.log(`Home Controller My: ${!!homeRoom.controller?.my}`)
        console.log(
            `Home Controller Downgrade: ${homeRoom.controller?.ticksToDowngrade ?? 'N/A'} ticks`,
        )
    }

    const sites = room.find(FIND_CONSTRUCTION_SITES)
    console.log(`\nConstruction Sites: ${sites.length}`)

    const MIN_REPAIR_THRESHOLD = 0.66
    const repairableStructures = room.find(FIND_STRUCTURES, {
        filter: (s) => {
            if (s.structureType === STRUCTURE_WALL || s.structureType === STRUCTURE_RAMPART) {
                return false
            }
            return s.hits / s.hitsMax < MIN_REPAIR_THRESHOLD
        },
    })
    console.log(`Repairable Structures: ${repairableStructures.length}`)

    console.log(`\n--- What Should Happen Next Tick ---`)
    if (creep.memory.currentTask === 'building' && sites.length === 0) {
        if (creep.store.energy === creep.store.getCapacity()) {
            console.log(
                '✅ Worker is full and has no construction sites -> will call assignWorkerPreference()',
            )
            console.log(`Expected outcome: currentTask should become 'no-task'`)
        } else {
            console.log('✅ Worker is not full -> will switch to collecting energy')
        }
    }
}

/**
 * Initializes state for starting from scratch.
 * Resets firstScoutingComplete flags, enables mining and autoclaim.
 */
function initialize() {
    console.log('=== Initializing State ===')

    // Reset firstScoutingComplete for all rooms
    let resetCount = 0
    for (const roomName in Memory.rooms) {
        if (Memory.rooms[roomName].firstScoutingComplete) {
            Memory.rooms[roomName].firstScoutingComplete = false
            resetCount++
        }
    }
    console.log(`Reset firstScoutingComplete flag for ${resetCount} room(s)`)

    // Enable mining
    if (!Memory.miningEnabled) {
        Memory.miningEnabled = true
        console.log('Mining enabled')
    } else {
        console.log('Mining already enabled')
    }

    // Enable autoclaim
    if (!Memory.autoclaim) {
        Memory.autoclaim = true
        console.log('Autoclaim enabled')
    } else {
        console.log('Autoclaim already enabled')
    }

    console.log('=== Initialization Complete ===')
}

export function isOwnedStructure(obj: Structure): obj is OwnedStructure {
    return 'owner' in obj
}

export function findUsername(): string {
    for (const structure of Object.values(Game.structures)) {
        if (structure && isOwnedStructure(structure)) {
            return structure.owner?.username ?? ''
        }
    }
    return ''
}

export default function assignGlobals(): void {
    if (!Memory.logLevel) {
        Memory.logLevel = 'warning'
    }

    global.killAllCreeps = killAllCreeps
    global.setLogLevel = Logger.setLogLevel
    global.saveSnapshot = saveSnapshot
    global.claimRoom = ErrorMapper.wrap(claimRoom)
    global.assignGlobals = assignGlobals
    global.sendWrecker = sendWrecker
    global.declareWar = declareWar
    global.cancelWar = cancelWar
    global.pauseConstruction = pauseConstruction
    global.unpauseConstruction = unpauseConstruction
    global.resetSnapshot = resetSnapshot
    global.printTasks = printTasks
    global.findUsername = findUsername
    global.debugRoom = debugRoom
    global.showClaimTasks = showClaimTasks
    global.initialize = initialize
    global.debugMineWorkers = debugMineWorkers
    global.debugWorker = debugWorker
}

declare global {
    namespace NodeJS {
        interface Global {
            killAllCreeps: (roomName: string) => void
            setLogLevel: (level: string) => void
            saveSnapshot: (roomName: string) => void
            claimRoom: (destination: string, startRoom: string) => void
            assignGlobals: () => void
            sendWrecker: (endRoom: string, startRoom: string) => void
            declareWar: (endRoom: string, warRoom: string) => void
            cancelWar: (warRoom: string) => void
            pauseConstruction: (room: string) => void
            unpauseConstruction: (room: string) => void
            resetSnapshot: (roomName: string) => void
            printTasks: (type?: Task<any>) => void
            findUsername: () => string
            debugRoom: (roomName: string) => void
            showClaimTasks: () => void
            initialize: () => void
            debugMineWorkers: (roomName: string) => void
            debugWorker: (creepName: string) => void
        }
    }
}
