import * as Logger from 'utils/logger'
import { MAX_SAVIOR_DISTANCE } from '../constants'
import { getLogisticsCreeps } from './creep'
import { resetSnapshot, saveSnapshot } from 'snapshot'
import { RoomManager } from 'managers/room-manager'
import { Task } from 'tasks/types'
import { canMine } from 'managers/mine-manager'
import { findMyRooms } from './room'
import { getAllTasks } from 'tasks/utils'
import { getConstructionFeaturesV3 } from 'construction-features'
import { LogisticsCreep } from 'roles/logistics-constants'
import { World } from './world'
import SourcesManager from 'managers/sources-manager'
import WarDepartment, { SpawnWarMemory, WarStatus } from 'war-department'
import DefenseDepartment from 'defense-department'

import ErrorMapper from './ErrorMapper'
import Empire from 'empire'
import roleWrecker from 'roles/wrecker'

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

/**
 * Defense namespace for debugging defense systems
 */
const defense = {
    /**
     * Debugs the defense system to see why towers aren't switching to repair mode
     * @param roomName - The room name to check
     */
    debug: (roomName: string) => {
        console.log(`=== Debug Defense: ${roomName} ===`)

        const room = Game.rooms[roomName]
        if (!room) {
            console.log('ERROR: Room not visible')
            return
        }

        const defenseDepartment = new DefenseDepartment(room)

        // Check hostile creeps
        const hostiles = room.find(FIND_HOSTILE_CREEPS)
        console.log(`\n--- Hostile Creeps (${hostiles.length}) ---`)
        if (hostiles.length === 0) {
            console.log('No hostile creeps found')
        } else {
            hostiles.forEach((hostile) => {
                const healParts = hostile.body.filter((p) => p.type === HEAL).length
                const rangedParts = hostile.body.filter((p) => p.type === RANGED_ATTACK).length
                const boosts = hostile.body
                    .filter((p) => p.boost)
                    .map((p) => `${p.type}:${p.boost}`)
                    .join(', ')
                console.log(`  ${hostile.name} (${hostile.owner.username})`)
                console.log(`    HEAL parts: ${healParts}, RANGED_ATTACK parts: ${rangedParts}`)
                if (boosts) {
                    console.log(`    Boosts: ${boosts}`)
                }
            })
        }

        // Calculate healing power
        const hasRangedAttackers = hostiles.some((h) => h.getActiveBodyparts(RANGED_ATTACK) > 0)
        const hostileHealingPower = defenseDepartment.calculateHostileHealingPower()
        console.log(`\n--- Healing Power ---`)
        console.log(`Has ranged attackers: ${hasRangedAttackers}`)
        console.log(`Total hostile healing power: ${hostileHealingPower} HP/tick`)
        if (!hasRangedAttackers && hostiles.some((h) => h.getActiveBodyparts(HEAL) > 0)) {
            console.log(`  (Healers present but no ranged attackers, so healing not counted)`)
        }

        // Calculate our attack power
        const towers = room.find(FIND_MY_STRUCTURES, {
            filter: { structureType: STRUCTURE_TOWER },
        })
        console.log(`\n--- Our Defense ---`)
        console.log(`Towers: ${towers.length}`)

        // Check current attackers
        const attackers = Object.values(Game.creeps).filter(
            (c) => c.memory.role === 'attacker' && c.memory.home === roomName,
        )
        console.log(`Current attackers: ${attackers.length}`)

        // Check overwhelming healing status
        const hasOverwhelming = defenseDepartment.hasOverwhelmingHealing()
        console.log(`\n--- Overwhelming Healing Check ---`)
        console.log(`hasOverwhelmingHealing(): ${hasOverwhelming}`)

        // Check base defense state
        const baseDefenseState = room.memory.baseDefense?.state
        const isInBaseDefense = defenseDepartment.isInBaseDefense()
        console.log(`\n--- Base Defense State ---`)
        console.log(`Memory state: ${baseDefenseState ?? 'null'}`)
        console.log(`isInBaseDefense(): ${isInBaseDefense}`)

        // Check base-repairer creeps
        const baseRepairers = Object.values(Game.creeps).filter(
            (c) => c.memory.role === 'base-repairer' && c.memory.home === roomName,
        )
        console.log(`Base-repairer creeps: ${baseRepairers.length}`)

        // Check matrix cache
        const hasMatrix = defenseDepartment.getBaseDefenseMatrix() !== null
        const repairTargets = defenseDepartment.getRepairTargets()
        console.log(`Base defense matrix cached: ${hasMatrix}`)
        console.log(`Pre-computed repair targets: ${repairTargets.length}`)

        // Check what towers should be doing
        console.log(`\n--- Tower Behavior ---`)
        console.log(
            `Towers should ${hasOverwhelming ? 'PRIORITIZE REPAIR/HEALING' : 'ATTACK HOSTILES'}`,
        )

        // Check for rampart construction sites
        const rampartSites = room.find(FIND_CONSTRUCTION_SITES, {
            filter: { structureType: STRUCTURE_RAMPART },
        })
        console.log(`\n--- Rampart Construction Sites ---`)
        console.log(
            `Rampart sites: ${rampartSites.length} ${
                rampartSites.length > 0 ? '(blocking matrix generation)' : ''
            }`,
        )

        console.log(`\n=== End Debug ===`)
    },
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
 * Debugs why a savior room isn't spawning rescue creeps
 * @param saviorName - The room that should be spawning rescue creeps
 */
function debugSavior(saviorName: string) {
    console.log(`=== Debug Savior: ${saviorName} ===\n`)

    const room = Game.rooms[saviorName]
    if (!room) {
        console.log('❌ ERROR: Room not visible')
        return
    }

    // Check war department status
    const warDept = new WarDepartment(room)
    console.log(`--- War Department Status ---`)
    console.log(`War Status: ${warDept.status}`)
    console.log(`War Target: ${room.memory.war?.target ?? 'none'}`)
    const warType = (room.memory.war as SpawnWarMemory).type
    console.log(`War Type: ${warType ?? 'N/A'}`)

    if (warDept.status !== WarStatus.SPAWN) {
        console.log(`\n❌ Not in SPAWN status, won't create war creeps`)
        return
    }

    const targetRoom = warDept.targetRoom
    if (!targetRoom) {
        console.log(`\n❌ Can't see target room ${warDept.target}`)
        return
    }

    console.log(`\n--- Target Room: ${targetRoom.name} ---`)
    console.log(`Has spawns: ${targetRoom.find(FIND_MY_SPAWNS).length > 0}`)

    // Check spawns in savior room
    const spawns = room.find(FIND_MY_SPAWNS)
    console.log(`\n--- Spawns in ${saviorName} ---`)
    console.log(`Total spawns: ${spawns.length}`)
    if (spawns.length === 0) {
        console.log('❌ No spawns to create rescue creeps!')
        return
    }

    for (const spawn of spawns) {
        console.log(`\nSpawn: ${spawn.name}`)
        console.log(`  Spawning: ${spawn.spawning ? spawn.spawning.name : 'no'}`)
        console.log(`  Energy: ${room.energyAvailable}/${room.energyCapacityAvailable}`)
    }

    // Check remote workers in target room
    const remoteWorkers = getLogisticsCreeps({ room: targetRoom })
    console.log(`\n--- Remote Workers in ${targetRoom.name} ---`)
    console.log(`Count: ${remoteWorkers.length}`)
    remoteWorkers.forEach((w) => {
        console.log(`  - ${w.name} (home: ${w.memory.home}, pos: ${w.pos})`)
    })

    // Check harvester situation
    console.log(`\n--- Harvester Status ---`)
    const sourcesManager = SourcesManager.create(targetRoom)
    if (!sourcesManager) {
        console.log('❌ No SourcesManager available')
    } else {
        const hasAllHarvesters = sourcesManager.hasAllContainerHarvesters()
        console.log(`Has all container harvesters: ${hasAllHarvesters}`)
    }

    // Trace through createImportantWarCreeps logic
    console.log(`\n--- createImportantWarCreeps() Logic ---`)

    if (warDept.hasSafeMode() || warDept.hasOverwhelmingForce()) {
        console.log(
            `❌ Safe mode or overwhelming force (safe: ${warDept.hasSafeMode()}, overwhelming: ${warDept.hasOverwhelmingForce()})`,
        )
        return
    }

    if (!warDept.targetRoom) {
        console.log(`❌ Target room not visible`)
        return
    }

    console.log(`\n✅ Passed safe mode check`)
    console.log(`✅ Target room visible`)

    // SPAWN status logic
    console.log(`\n--- SPAWN Status Decision Tree ---`)
    if (remoteWorkers.length === 0) {
        console.log(`1. ✅ No remote workers -> SHOULD spawn worker with home=${targetRoom.name}`)
    } else if (remoteWorkers.length < 2) {
        console.log(
            `2. ✅ Remote workers (${remoteWorkers.length}) < 2 -> SHOULD spawn worker with home=${targetRoom.name}`,
        )
    } else if (sourcesManager && !sourcesManager.hasAllContainerHarvesters()) {
        console.log(`3. ✅ Missing container harvesters -> SHOULD spawn harvester`)
    } else if (remoteWorkers.length < 4) {
        console.log(
            `4. ✅ Remote workers (${remoteWorkers.length}) < 4 -> SHOULD spawn worker with home=${targetRoom.name}`,
        )
    } else {
        console.log(
            `5. ❌ Has ${remoteWorkers.length} workers and all harvesters -> Nothing to spawn`,
        )
    }

    console.log(`\n--- Spawn Strategy Check ---`)
    console.log(`Strategy calls createImportantWarCreeps at line 178 of rcl-2.ts`)
    console.log(`This happens AFTER:`)
    console.log(`  - Scout room tasks`)
    console.log(`  - Energy check (>= 300)`)
    console.log(`  - Defense needs`)
    console.log(`  - Hauler/harvester needs`)
    console.log(`  - Upgraders/builders`)
    console.log(`  - Rebalancers`)
    console.log(`\nSo if spawn is creating those first, war creeps wait.`)
}

/**
 * Debugs why a room without spawns is not being rescued
 * @param roomName - The room that needs rescue
 */
function debugRescue(roomName: string) {
    console.log(`=== Debug Rescue: ${roomName} ===\n`)

    const room = Game.rooms[roomName]
    if (!room) {
        console.log('❌ ERROR: Room not visible')
        return
    }

    // Check if room is owned
    if (!room.controller?.my) {
        console.log('❌ ERROR: Room is not owned by you')
        return
    }

    // Check spawn situation
    const spawns = room.find(FIND_MY_SPAWNS)
    console.log(`Spawns in room: ${spawns.length}`)
    if (spawns.length > 0) {
        console.log('✅ Room has spawns - no rescue needed!\n')
        return
    }

    console.log('❌ Room has no spawns - NEEDS RESCUE\n')

    // Check collapsed status
    console.log(`--- Collapsed Status ---`)
    console.log(`room.memory.collapsed: ${room.memory.collapsed ?? 'undefined'}`)

    // Check if any room is already trying to save this room
    console.log(`\n--- Existing Rescue Operations ---`)
    let foundRescueOp = false
    for (const [rName, mem] of Object.entries(Memory.rooms)) {
        if (mem.war?.target === roomName) {
            console.log(`✅ ${rName} has war.target = ${roomName}`)
            console.log(`   War Status: ${mem.war.status}`)
            const warType = (mem.war as SpawnWarMemory).type
            console.log(`   War Type: ${warType ?? 'N/A'}`)
            foundRescueOp = true
        }
    }
    if (!foundRescueOp) {
        console.log('❌ No rooms are currently targeting this room for rescue')
    }

    // Find potential saviors
    console.log(`\n--- Potential Saviors (within ${MAX_SAVIOR_DISTANCE} range) ---`)
    const world = new World()
    const closestRooms = world.getClosestRooms([roomName], MAX_SAVIOR_DISTANCE)

    const candidates = closestRooms
        .filter(({ roomName: rn }) => {
            const r = Game.rooms[rn]
            return r?.controller?.my && r.find(FIND_MY_SPAWNS).length > 0
        })
        .sort((a, b) => a.distance - b.distance)

    if (candidates.length === 0) {
        console.log(`❌ No owned rooms with spawns within ${MAX_SAVIOR_DISTANCE} distance`)
    } else {
        console.log(`Found ${candidates.length} potential savior room(s):`)
        for (const { roomName: rn, distance } of candidates) {
            const r = Game.rooms[rn]
            const warDepartment = new WarDepartment(r)
            const warStatus = warDepartment.status
            console.log(
                `  ${rn} - distance: ${distance}, war status: ${warStatus}, spawns: ${
                    r.find(FIND_MY_SPAWNS).length
                }`,
            )
        }

        // Check the best candidate specifically
        const best = candidates[0]
        const bestRoom = Game.rooms[best.roomName]
        console.log(`\n--- Best Candidate: ${best.roomName} ---`)
        console.log(`Distance: ${best.distance}`)

        const warDept = new WarDepartment(bestRoom)
        console.log(`War Status: ${warDept.status}`)
        console.log(`War Target: ${bestRoom.memory.war?.target ?? 'none'}`)

        // Check if this savior is blocked by another war
        if (warDept.status !== WarStatus.NONE) {
            console.log(`⚠️  This room is already in a war operation`)
            console.log(`   Target: ${bestRoom.memory.war?.target}`)
            const warType = (bestRoom.memory.war as SpawnWarMemory).type
            console.log(`   Type: ${warType ?? 'N/A'}`)
        }
    }

    // Check findSaviors logic from empire.ts
    console.log(`\n--- Empire.findSaviors() Logic Check ---`)
    console.log(
        `1. Does room have spawns? ${
            spawns.length > 0 ? 'YES (skip rescue)' : 'NO (needs rescue)'
        }`,
    )

    const alreadyTargeted = Object.values(Memory.rooms).some((r) => r.war?.target === roomName)
    console.log(
        `2. Is already a war target? ${alreadyTargeted ? 'YES (skip rescue)' : 'NO (can rescue)'}`,
    )

    console.log(
        `3. Can find savior within ${MAX_SAVIOR_DISTANCE}? ${candidates.length > 0 ? 'YES' : 'NO'}`,
    )

    if (candidates.length > 0 && !alreadyTargeted) {
        console.log(`\n✅ Empire should assign ${candidates[0].roomName} as savior on next tick`)
    } else if (alreadyTargeted) {
        console.log(`\n⚠️  A rescue operation is already active (or was started this tick)`)
    } else {
        console.log(`\n❌ No eligible savior rooms found`)
    }

    // Additional debugging
    console.log(`\n--- Additional Info ---`)
    console.log(`Game.time: ${Game.time}`)
    console.log(`MAX_SAVIOR_DISTANCE constant: ${MAX_SAVIOR_DISTANCE}`)
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
    global.defense = defense
    global.showClaimTasks = showClaimTasks
    global.initialize = initialize
    global.debugMineWorkers = debugMineWorkers
    global.debugWorker = debugWorker
    global.debugRescue = debugRescue
    global.debugSavior = debugSavior
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
            defense: {
                debug: (roomName: string) => void
            }
            showClaimTasks: () => void
            initialize: () => void
            debugMineWorkers: (roomName: string) => void
            debugWorker: (creepName: string) => void
            debugRescue: (roomName: string) => void
            debugSavior: (saviorName: string) => void
        }
    }
}
