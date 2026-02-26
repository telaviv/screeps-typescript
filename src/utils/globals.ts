import * as Logger from 'utils/logger'
import { MAX_SAVIOR_DISTANCE } from '../constants'
import { getCreeps, getLogisticsCreeps } from './creep'
import { resetSnapshot, saveSnapshot } from 'snapshot'
import { RoomManager } from 'managers/room-manager'
import { Task } from 'tasks/types'
import { canMine, MineManager } from 'managers/mine-manager'
import { findMyRooms, getLinks } from './room'
import { getAllTasks } from 'tasks/utils'
import {
    getConstructionFeatures,
    getConstructionFeaturesV3,
    validateConstructionFeatures,
} from 'construction-features'
import { LogisticsCreep } from 'roles/logistics-constants'
import { World } from './world'
import SourcesManager from 'managers/sources-manager'
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import MineralManager, { getMineralManager } from 'managers/mineral-manager'
import WarDepartment, { SpawnWarMemory, WarStatus } from 'war-department'
import DefenseDepartment from 'defense-department'
import { AttackerMemory } from 'roles/attacker'
import hash from './hash'
import { getTotalDroppedResources } from 'tasks/pickup'
import { getBuildManager } from 'managers/build-manager'
import LinkManager from 'managers/link-manager'
import type { Links } from 'construction-features'

import ErrorMapper from './ErrorMapper'
import Empire from 'empire'
import roleWrecker from 'roles/wrecker'
import { ATTACKERS_COUNT } from 'spawn/strategy/constants'

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

function declareWar(endRoom: string, warRoom: string, ownRoom = true) {
    const warDepartment = new WarDepartment(Game.rooms[warRoom])
    warDepartment.declareWar(endRoom, ownRoom)
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
            (c) => c.memory.role === 'attack' && c.memory.home === roomName,
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
 * Debugs why a spawn is not creating new creeps
 * @param roomName - The room to debug spawn behavior for
 */
function debugSpawn(roomName: string) {
    console.log(`=== Debug Spawn: ${roomName} ===\n`)

    const room = Game.rooms[roomName]
    if (!room) {
        console.log('❌ ERROR: Room not visible')
        return
    }

    const spawns = room.find(FIND_MY_SPAWNS)
    console.log(`--- Spawns (${spawns.length}) ---`)
    if (spawns.length === 0) {
        console.log('❌ No spawns in room!')
        return
    }

    for (const spawnStructure of spawns) {
        console.log(`\nSpawn: ${spawnStructure.name}`)
        console.log(`  ID: ${spawnStructure.id}`)
        console.log(
            `  Spawning: ${
                spawnStructure.spawning ? `YES - ${spawnStructure.spawning.name}` : 'NO'
            }`,
        )

        if (spawnStructure.spawning) {
            console.log(`    Remaining time: ${spawnStructure.spawning.remainingTime} ticks`)
            console.log(`    ✅ This spawn is currently spawning, will check again when done`)
        }
    }

    const spawn = spawns[0] // Debug first spawn

    // Check collapsed status
    console.log(`\n--- Room Status ---`)
    console.log(`Collapsed: ${room.memory.collapsed ?? 'false'}`)
    if (room.memory.collapsed) {
        console.log(`⚠️  Room is COLLAPSED - only spawning rescue creeps`)
        return
    }

    // Check spawn timing
    const SPAWN_CHECK_MOD = 4
    const currentMod = (hash(spawn.id) + Game.time) % SPAWN_CHECK_MOD
    console.log(`\n--- Spawn Timing ---`)
    console.log(`Game.time: ${Game.time}`)
    console.log(
        `Spawn check mod: (hash(${spawn.id}) + ${Game.time}) % ${SPAWN_CHECK_MOD} = ${currentMod}`,
    )
    if (currentMod !== 0) {
        console.log(`⚠️  Not a spawn check tick (waits for mod = 0)`)
        console.log(`   Next spawn check in ${SPAWN_CHECK_MOD - currentMod} tick(s)`)
    } else {
        console.log(`✅ This is a spawn check tick`)
    }

    // Check energy
    console.log(`\n--- Energy ---`)
    console.log(`Available: ${room.energyAvailable}`)
    console.log(`Capacity: ${room.energyCapacityAvailable}`)
    console.log(
        `Percentage: ${((room.energyAvailable / room.energyCapacityAvailable) * 100).toFixed(1)}%`,
    )

    const SPAWN_ENERGY_CAPACITY = 300
    if (room.energyAvailable < SPAWN_ENERGY_CAPACITY) {
        console.log(`❌ Energy too low (need ${SPAWN_ENERGY_CAPACITY})`)
    } else {
        console.log(`✅ Enough energy for basic spawn`)
    }

    const minEnergy = Math.min(0.95 * room.energyCapacityAvailable, 1800) // MAX_USEFUL_ENERGY
    if (room.energyAvailable < minEnergy) {
        console.log(`⚠️  Below 95% threshold (${minEnergy}) for swarm strategy`)
    } else {
        console.log(`✅ Above 95% threshold for swarm strategy`)
    }

    // Check room manager tasks
    const roomManager = new RoomManager(room)
    const scoutTasks = roomManager.getScoutRoomTasks()
    console.log(`\n--- Room Manager ---`)
    console.log(`Scout room tasks: ${scoutTasks.length}`)
    if (scoutTasks.length > 0) {
        const taskRoomNames = scoutTasks.map((t) => t.data.room).join(', ')
        console.log(`⚠️  Priority: Spawning scouts for: ${taskRoomNames}`)
    }

    // Check defense
    const defenseDepartment = new DefenseDepartment(room)
    console.log(`\n--- Defense ---`)
    console.log(`Needs defenders: ${defenseDepartment.needsDefenders()}`)
    console.log(`Needs healer: ${defenseDepartment.needsHealer()}`)
    console.log(`Has overwhelming healing: ${defenseDepartment.hasOverwhelmingHealing()}`)

    if (defenseDepartment.needsDefenders() || defenseDepartment.needsHealer()) {
        console.log(`⚠️  Priority: Defense needs`)
    }

    if (defenseDepartment.hasOverwhelmingHealing()) {
        const baseRepairers = getLogisticsCreeps({ room, preference: 'base-repairer' }).length
        const workers = getLogisticsCreeps({ room, preference: 'worker' }).length
        console.log(`  Base-repairers: ${baseRepairers}/3`)
        console.log(`  Workers: ${workers}/2`)
        if (baseRepairers < 3 || workers < 2) {
            console.log(`⚠️  Priority: Overwhelming healing detected, need more repair workers`)
        }
    }

    // Check creep counts
    console.log(`\n--- Creep Counts ---`)
    const roles = [
        'harvester',
        'energy-hauler',
        'logistics',
        'mason',
        'rebalancer',
        'scout',
        'attack',
        'healer',
        'claimer',
    ]
    for (const role of roles) {
        const creeps = getCreeps(role, room)
        console.log(`  ${role}: ${creeps.length}`)
    }

    const logisticsWorkers = getLogisticsCreeps({ room, preference: 'worker' }).length
    const logisticsUpgraders = getLogisticsCreeps({ room, preference: 'upgrading' }).length
    const logisticsBuilders = getLogisticsCreeps({ room, preference: 'building' }).length
    console.log(`  logistics (worker): ${logisticsWorkers}`)
    console.log(`  logistics (upgrading): ${logisticsUpgraders}`)
    console.log(`  logistics (building): ${logisticsBuilders}`)

    // Check sources manager
    const sourcesManager = new SourcesManager(room)
    console.log(`\n--- Sources Manager ---`)
    console.log(`Has all container harvesters: ${sourcesManager.hasAllContainerHarvesters()}`)
    console.log(`Has enough harvesters: ${sourcesManager.hasEnoughHarvesters()}`)

    if (!sourcesManager.hasAllContainerHarvesters()) {
        console.log(`⚠️  Priority: Missing container harvesters`)
    }

    // Check construction sites
    const constructionSites = room
        .find(FIND_CONSTRUCTION_SITES)
        .filter((site) => site.structureType !== STRUCTURE_RAMPART)
    console.log(`\n--- Construction ---`)
    console.log(`Construction sites (non-rampart): ${constructionSites.length}`)
    if (constructionSites.length > 0) {
        const siteTypes = constructionSites
            .map((s) => s.structureType)
            .reduce((acc: { [key: string]: number }, type) => {
                acc[type] = (acc[type] || 0) + 1
                return acc
            }, {})
        for (const [type, count] of Object.entries(siteTypes)) {
            console.log(`  - ${type}: ${count}`)
        }
    }

    // Check dropped resources
    const droppedResources = getTotalDroppedResources(room)
    console.log(`\n--- Dropped Resources ---`)
    console.log(`Total dropped energy: ${droppedResources}`)
    const MAX_DROPPED_RESOURCES = 1000
    if (droppedResources > MAX_DROPPED_RESOURCES) {
        console.log(`⚠️  Above threshold (${MAX_DROPPED_RESOURCES}) - may spawn 2nd rebalancer`)
    }

    // Check war status
    const warDepartment = new WarDepartment(room)
    console.log(`\n--- War Department ---`)
    console.log(`Status: ${warDepartment.status}`)
    console.log(`Target: ${room.memory.war?.target ?? 'none'}`)
    if (warDepartment.status !== 'none') {
        console.log(`⚠️  War operations active`)
    }

    // Check link count
    const linkCount = getLinks(room).length
    console.log(`\n--- Strategy ---`)
    console.log(`Links: ${linkCount}`)
    console.log(`Using: ${linkCount >= 2 ? 'LINK strategy' : 'SWARM strategy'}`)

    // Check virtual storage
    const virtualStorage = room.storage || room.terminal
    console.log(`Virtual storage: ${virtualStorage ? 'YES' : 'NO'}`)

    // Check mining status
    console.log(`\n--- Mining ---`)
    console.log(`Mining enabled: ${Memory.miningEnabled ?? false}`)
    if (Memory.miningEnabled && room.memory.mines) {
        console.log(`Mines assigned: ${room.memory.mines.length}`)
        let minesNeedingAttention = 0
        for (const mine of room.memory.mines) {
            const mineManager = new MineManager(mine.name, room)
            const needsAttention = mineManager.needsAttention()
            if (needsAttention) {
                minesNeedingAttention++
            }
            console.log(`  - ${mine.name}: ${needsAttention ? '⚠️  NEEDS ATTENTION' : '✅ OK'}`)
        }
        if (minesNeedingAttention > 0) {
            console.log(`\n⚠️  ${minesNeedingAttention} mine(s) need attention`)
            console.log(`   Use global.mines.status() for detailed mine info`)
        }
    }

    // Check latent worker cooldown
    console.log(`\n--- Latent Worker Spawning ---`)
    const lastLatentWorker = room.memory.lastLatentWorker ?? 0
    const LATENT_WORKER_INTERVAL_MULTIPLIER = 200
    const minAvailableEnergy = Math.min(room.energyAvailable, room.energyCapacityAvailable)
    const latentInterval = Math.floor(minAvailableEnergy * LATENT_WORKER_INTERVAL_MULTIPLIER)
    const ticksSinceLastLatent = Game.time - lastLatentWorker
    const ticksUntilNext = latentInterval - ticksSinceLastLatent

    console.log(
        `Last latent worker: ${lastLatentWorker === 0 ? 'never' : `tick ${lastLatentWorker}`}`,
    )
    console.log(`Latent interval: ${latentInterval} ticks`)
    console.log(`Ticks since last: ${ticksSinceLastLatent}`)
    if (ticksUntilNext > 0) {
        console.log(`⏳ Next latent worker in: ${ticksUntilNext} ticks`)
    } else {
        console.log(`✅ Ready to spawn latent worker`)
    }

    // Provide suggestions
    console.log(`\n--- Analysis ---`)

    if (spawn.spawning) {
        console.log(`✅ Spawn is working - creating ${spawn.spawning.name}`)
    } else if (currentMod !== 0) {
        console.log(`⏳ Waiting for spawn check tick (${SPAWN_CHECK_MOD - currentMod} more ticks)`)
    } else if (room.energyAvailable < SPAWN_ENERGY_CAPACITY) {
        console.log(`❌ Not enough energy (${room.energyAvailable}/${SPAWN_ENERGY_CAPACITY})`)
    } else if (scoutTasks.length > 0) {
        console.log(`📍 Priority: Scouting ${scoutTasks[0].data.room}`)
    } else if (defenseDepartment.needsDefenders()) {
        console.log(`⚔️  Priority: Creating defenders`)
    } else if (defenseDepartment.needsHealer()) {
        console.log(`⚕️  Priority: Creating healer`)
    } else if (!sourcesManager.hasAllContainerHarvesters()) {
        console.log(`⛏️  Priority: Creating harvester for source`)
    } else if (room.energyAvailable < minEnergy) {
        console.log(`⏳ Waiting for more energy (${room.energyAvailable}/${minEnergy.toFixed(0)})`)
    } else if (Memory.miningEnabled && room.memory.mines) {
        // Check if any mines need attention
        const minesNeedingAttention = room.memory.mines.filter((mine) => {
            const mm = new MineManager(mine.name, room)
            return mm.needsAttention()
        })
        if (minesNeedingAttention.length > 0) {
            console.log(
                `⛏️  Priority: ${minesNeedingAttention.length} mine(s) need attention (should spawn mine workers)`,
            )
            console.log(
                `   This should trigger createMineWorkers() - if not spawning, there may be a blocking condition`,
            )
            console.log(`   Run global.mines.status() for details on what each mine needs`)
        } else if (droppedResources > MAX_DROPPED_RESOURCES && !virtualStorage) {
            console.log(
                `💰 ${droppedResources} dropped resources but no virtual storage for rebalancer`,
            )
            console.log(`   Workers should pick these up, but may need more workers`)
        } else if (ticksUntilNext > 0) {
            console.log(`⏳ Waiting for latent worker cooldown (${ticksUntilNext} ticks)`)
        } else {
            console.log(`🤔 All spawn conditions checked:`)
            console.log(`   ✅ Has all required creep types`)
            console.log(`   ✅ All mines OK`)
            console.log(`   ✅ Latent worker cooldown expired`)
            console.log(
                `   → Should spawn a latent worker on next spawn check tick (if shouldCreateCreep passes)`,
            )
        }
    } else if (droppedResources > MAX_DROPPED_RESOURCES && !virtualStorage) {
        console.log(
            `💰 ${droppedResources} dropped resources but no virtual storage for rebalancer`,
        )
        console.log(`   Workers should pick these up, but may need more workers`)
    } else if (ticksUntilNext > 0) {
        console.log(`⏳ Waiting for latent worker cooldown (${ticksUntilNext} ticks)`)
    } else {
        console.log(`🤔 All spawn conditions checked:`)
        console.log(`   ✅ Has all required creep types`)
        console.log(`   ✅ Latent worker cooldown expired`)
        console.log(
            `   → Should spawn a latent worker on next spawn check tick (if shouldCreateCreep passes)`,
        )
    }

    console.log(`\n=== End Debug ===`)
}

/**
 * Debugs why mine workers aren't being spawned for a specific mine
 * @param mineName - The mine room name
 * @param baseRoomName - The base room that should spawn workers
 */
function debugMineWorkerSpawn(mineName: string, baseRoomName: string) {
    console.log(`=== Debug Mine Worker Spawn: ${mineName} (from ${baseRoomName}) ===\n`)

    const baseRoom = Game.rooms[baseRoomName]
    if (!baseRoom) {
        console.log('❌ ERROR: Base room not visible')
        return
    }

    const mineManager = new MineManager(mineName, baseRoom)

    console.log(`--- Mine Status ---`)
    console.log(`Needs attention: ${mineManager.needsAttention()}`)

    if (!mineManager.needsAttention()) {
        console.log('✅ Mine does not need attention - nothing to spawn')
        return
    }

    // Check spawn
    const spawns = baseRoom.find(FIND_MY_SPAWNS)
    if (spawns.length === 0) {
        console.log('❌ No spawns in base room')
        return
    }
    const spawn = spawns[0]
    console.log(`Spawn: ${spawn.name}`)
    console.log(`Energy available: ${baseRoom.energyAvailable}/${baseRoom.energyCapacityAvailable}`)

    const capacity = Math.min(1800, baseRoom.energyCapacityAvailable)

    // Check vision
    console.log(`\n--- Step 1: Vision Check ---`)
    if (!mineManager.hasVision()) {
        console.log(`❌ No vision of mine room`)

        // Check if recorded hostiles require an attacker instead of a scout
        const needsProtectionNoVision = mineManager.needsProtection()
        console.log(`Needs protection (from recorded data): ${needsProtectionNoVision}`)
        if (needsProtectionNoVision) {
            const currentDefenders = mineManager.getDefenders()
            console.log(`Defenders already assigned: ${currentDefenders.length}`)
            if (currentDefenders.length < 2) {
                console.log(`✅ Should spawn attacker (recorded hostiles, no vision)`)
            } else {
                console.log(`⏳ Enough defenders already assigned, waiting for them to arrive`)
            }
            return
        }

        const scouts = getCreeps('scout', baseRoom)
        const scoutsToMine = scouts.filter((s) =>
            s.memory.tasks.some(
                (task) =>
                    task.type === 'travel' &&
                    'destination' in task &&
                    task.destination === mineName,
            ),
        )
        console.log(`Scouts going there: ${scoutsToMine.length}`)

        const scoutTasks = RoomManager.getAllScoutTasks().filter(
            (task) => task.data.room === mineName,
        )
        console.log(`Scout tasks queued: ${scoutTasks.length}`)

        const claimers = mineManager.getClaimers()
        console.log(`Claimers going there: ${claimers.length}`)

        if (scoutsToMine.length > 0 || scoutTasks.length > 0 || claimers.length > 0) {
            console.log(
                `⏳ Scout/claimer already on the way - createMineWorkers returns early (line 381-395)`,
            )
            return
        }

        console.log(`✅ Should spawn scout or claimer`)
        console.log(
            `   - Has capacity to reserve: ${mineManager.hasCapacityToReserve()} (would spawn claimer if true)`,
        )
        return
    }

    console.log(`✅ Has vision of mine room`)

    // Check defenders
    console.log(`\n--- Step 2: Defense Check ---`)
    const defenders = mineManager.getDefenders()
    const needsProtection = mineManager.needsProtection()
    console.log(`Needs protection: ${needsProtection}`)
    console.log(`Defenders: ${defenders.length}`)

    if (needsProtection && defenders.length < ATTACKERS_COUNT) {
        console.log(`✅ Should spawn attacker (line 407-410)`)
        return
    }

    // Check healer
    console.log(`\n--- Step 3: Healer Check ---`)
    console.log(`Needs healer: ${mineManager.needsHealer()}`)
    if (mineManager.needsHealer()) {
        console.log(`✅ Should spawn healer (line 412-414)`)
        return
    }

    // Check capacity adjustment
    console.log(`\n--- Step 4: Capacity Adjustment ---`)
    const mineRoom = mineManager.room
    if (!mineRoom) {
        console.log('❌ ERROR: Mine room not visible (but hasVision returned true?)')
        return
    }

    const reservationTicks = mineManager.controllerReservationTicksLeft()
    const droppedInMine = getTotalDroppedResources(mineRoom)
    const useLowerCapacity = reservationTicks <= 1000 || droppedInMine >= 1000

    console.log(`Reservation ticks: ${reservationTicks}`)
    console.log(`Dropped resources in mine: ${droppedInMine}`)
    console.log(`Use lower capacity: ${useLowerCapacity}`)

    let effectiveCapacity = capacity
    if (useLowerCapacity) {
        const targetRcl = Math.max(1, (baseRoom.controller?.level ?? 1) - 1)
        const energyCapacityByRcl = [300, 300, 550, 800, 1300, 1800, 2300, 5600, 12900]
        effectiveCapacity = energyCapacityByRcl[targetRcl] || 300
        console.log(`   Effective capacity reduced to: ${effectiveCapacity}`)
    }

    // Check workers (first pass)
    console.log(`\n--- Step 5: Initial Worker Check ---`)
    const hasEnoughConstructionParts = mineManager.hasEnoughConstructionParts()
    const workers = mineManager.getWorkers()
    const constructionFinished = mineManager.constructionFinished()
    const constructionSites = mineManager.room
        ? mineManager.room.find(FIND_MY_CONSTRUCTION_SITES)
        : []
    const workParts = workers.reduce((acc, c) => acc + c.getActiveBodyparts(WORK), 0)
    console.log(`Construction finished: ${constructionFinished}`)
    console.log(`Construction sites: ${constructionSites.length}`)
    console.log(`Has enough construction parts: ${hasEnoughConstructionParts}`)
    console.log(`Workers: ${workers.length} (${workParts} WORK parts, need 15, max 4)`)

    if (!hasEnoughConstructionParts && workers.length === 0) {
        console.log(`✅ Should spawn worker (no construction parts, no workers) (line 439-445)`)
        return
    }

    // Check harvesters
    console.log(`\n--- Step 6: Harvester Check ---`)
    const hasEnoughHarvesters = mineManager.hasEnoughHarvesters()
    console.log(`Has enough harvesters: ${hasEnoughHarvesters}`)

    if (!hasEnoughHarvesters) {
        console.log(`✅ Should spawn harvester (line 448-455)`)
        return
    }

    // Check workers (second pass)
    console.log(`\n--- Step 7: Worker Check (Second Pass) ---`)
    if (!hasEnoughConstructionParts) {
        console.log(`✅ Should spawn worker (has harvesters but needs construction) (line 457-463)`)
        return
    }

    // Check haulers
    console.log(`\n--- Step 8: Hauler Check ---`)
    const hasEnoughHaulers = mineManager.hasEnoughHaulers()
    console.log(`Has enough haulers: ${hasEnoughHaulers}`)

    if (!hasEnoughHaulers) {
        console.log(`✅ Should spawn hauler (line 465-471)`)
        return
    }

    // Check repairers
    console.log(`\n--- Step 9: Repairer Check ---`)
    const needsRepairs = mineManager.needsRepairs()
    console.log(`Needs repairs: ${needsRepairs}`)
    if (needsRepairs) {
        console.log(`✅ Should spawn repairer (logistics bot with TASK_REPAIRING)`)
        return
    }

    // Check movement diff / dismantler
    console.log(`\n--- Step 10: Movement Diff Check ---`)
    const hasMovementDiff = mineManager.hasMovementDiff()
    const workerCount = mineManager.getWorkers().length
    console.log(`Has movement diff: ${hasMovementDiff}`)
    console.log(`Current workers: ${workerCount}`)
    if (hasMovementDiff && workerCount < 4) {
        console.log(`✅ Should spawn dismantler (logistics worker for movement diff)`)
        return
    }

    // Check reservers (fallback)
    console.log(`\n--- Step 11: Reserver Check (fallback) ---`)
    const hasCapacity = mineManager.hasCapacityToReserve()
    const hasEnoughReservers = mineManager.hasEnoughReservers()
    const hasClaimSpot = mineManager.hasClaimSpotAvailable()
    console.log(`Has capacity to reserve: ${hasCapacity}`)
    console.log(`Has enough reservers: ${hasEnoughReservers}`)
    console.log(`Has claim spot available: ${hasClaimSpot}`)
    if (hasCapacity && !hasEnoughReservers && hasClaimSpot) {
        console.log(`✅ Should spawn claimer/reserver`)
        return
    }

    console.log(`\n--- Result ---`)
    console.log(`🤔 All checks passed - mine doesn't actually need anything?`)
    console.log(`   This suggests needsAttention() returned true but all specific needs are met`)
    console.log(`   Mine might be transitioning states or there's a logic inconsistency`)

    console.log(`\n=== End Debug ===`)
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

/**
 * Fixes attackers stuck in pairing mode by removing their pairing memory.
 * This allows them to attack immediately instead of wandering.
 */
function fixStuckAttackers(): void {
    let fixedCount = 0
    for (const creep of Object.values(Game.creeps)) {
        if (creep.memory.role === 'attack') {
            const attackerMemory = creep.memory as AttackerMemory
            if (attackerMemory.asPair === true || attackerMemory.paired === false) {
                console.log(`Fixing stuck attacker: ${creep.name} in ${attackerMemory.roomName}`)
                delete attackerMemory.asPair
                delete attackerMemory.paired
                fixedCount++
            }
        }
    }
    if (fixedCount > 0) {
        console.log(`Fixed ${fixedCount} stuck attacker(s). They should start attacking now!`)
    } else {
        console.log('No stuck attackers found.')
    }
}

/**
 * Debug function to show what logistics creeps in a room are doing.
 */
function debugLogistics(roomName: string): void {
    const room = Game.rooms[roomName]
    if (!room) {
        console.log(`❌ ERROR: Room ${roomName} not visible`)
        return
    }

    const logistics = room
        .find(FIND_MY_CREEPS)
        .filter((c) => c.memory.role === 'logistics') as LogisticsCreep[]

    if (logistics.length === 0) {
        console.log(`No logistics creeps found in ${roomName}`)
        return
    }

    console.log(`=== Logistics creeps in ${roomName} (${logistics.length} total) ===\n`)

    for (const creep of logistics) {
        const mem = creep.memory
        console.log(`${creep.name}:`)
        console.log(`  Home: ${mem.home}`)
        console.log(`  Current room: ${creep.room.name}`)
        console.log(`  Is in home room: ${creep.room.name === mem.home}`)
        console.log(`  Preference: ${mem.preference}`)
        console.log(`  Current task: ${mem.currentTask}`)
        console.log(`  Task queue length: ${mem.tasks.length}`)
        console.log(`  No suicide: ${mem.noSuicide}`)
        console.log(`  No repair limit: ${mem.noRepairLimit}`)
        console.log(
            `  Energy: ${creep.store.getUsedCapacity(RESOURCE_ENERGY)}/${creep.store.getCapacity(
                RESOURCE_ENERGY,
            )}`,
        )

        // Check what construction sites exist
        const buildManager = getBuildManager(room)
        const nonWallSites = room
            .find(FIND_CONSTRUCTION_SITES)
            .filter(
                (site) =>
                    site.structureType !== STRUCTURE_WALL &&
                    site.structureType !== STRUCTURE_RAMPART,
            )
        console.log(`  Non-wall construction sites in room: ${nonWallSites.length}`)
        console.log(
            `  Build manager has non-wall sites: ${
                buildManager?.hasNonWallConstructionSites() ?? 'N/A'
            }`,
        )

        // Check walls
        const fragileWalls = room.find(FIND_STRUCTURES).filter((s) => {
            if (s.structureType === STRUCTURE_WALL || s.structureType === STRUCTURE_RAMPART) {
                return s.hits < s.hitsMax
            }
            return false
        })
        console.log(`  Walls/ramparts needing repair: ${fragileWalls.length}`)

        console.log('')
    }
}

/**
 * Debug function to show what attackers are doing and what they see.
 */
function debugAttackers(): void {
    const attackers = Object.values(Game.creeps).filter((c) => c.memory.role === 'attack')

    if (attackers.length === 0) {
        console.log('No attackers found')
        return
    }

    console.log(`=== Found ${attackers.length} attacker(s) ===`)

    for (const creep of attackers) {
        const mem = creep.memory as AttackerMemory
        console.log(`\n${creep.name}:`)
        console.log(`  Position: ${creep.pos}`)
        console.log(`  Target room: ${mem.roomName}`)
        console.log(`  Current room: ${creep.room.name}`)
        console.log(`  In target room: ${creep.room.name === mem.roomName}`)
        console.log(`  asPair: ${mem.asPair}`)
        console.log(`  paired: ${mem.paired}`)

        const targetRoom = Game.rooms[mem.roomName]
        if (targetRoom) {
            const hostileCreeps = targetRoom.find(FIND_HOSTILE_CREEPS)
            const hostileStructures = targetRoom.find(FIND_HOSTILE_STRUCTURES)
            const hostileSites = targetRoom.find(FIND_HOSTILE_CONSTRUCTION_SITES)

            console.log(`  Target room vision: YES`)
            console.log(`  Hostile creeps: ${hostileCreeps.length}`)
            console.log(`  Hostile structures: ${hostileStructures.length}`)
            console.log(`  Hostile construction sites: ${hostileSites.length}`)

            if (hostileSites.length > 0) {
                const closest = creep.pos.findClosestByRange(hostileSites)
                if (closest) {
                    console.log(
                        `  Closest site: ${closest.structureType} at ${
                            closest.pos
                        } (range: ${creep.pos.getRangeTo(closest)})`,
                    )
                }
            }
        } else {
            console.log(`  Target room vision: NO`)
        }
    }
}

/**
 * Checks construction features for position conflicts that would cause structures to be destroyed.
 * @param roomName - The room to check
 */
function checkFeatureConflicts(roomName: string): void {
    const features = getConstructionFeatures(roomName)
    if (!features) {
        console.log(`No features found for ${roomName}`)
        return
    }

    const conflicts = validateConstructionFeatures(features)
    if (conflicts.length === 0) {
        console.log(`✓ No conflicts found in ${roomName}`)
    } else {
        console.log(`✗ Found ${conflicts.length} conflict(s) in ${roomName}:`)
        for (const conflict of conflicts) {
            console.log(
                `  Position (${conflict.pos.x}, ${conflict.pos.y}): ${conflict.types.join(', ')}`,
            )
        }
    }
}

/**
 * Debugs link energy transfer issues
 * @param roomName - The room to debug link operations for
 */
function debugLinks(roomName: string): void {
    console.log(`=== Debug Links: ${roomName} ===\n`)

    const room = Game.rooms[roomName]
    if (!room) {
        console.log('❌ ERROR: Room not visible')
        return
    }

    // Get link manager
    const linkManager = LinkManager.createFromRoom(room)

    if (!linkManager) {
        console.log('❌ No link manager for this room')
        console.log('This could mean:')
        console.log('  - No calculated link positions in construction features')
        console.log('  - Room has not completed surveying')
        return
    }

    console.log(`--- Link Manager Configuration ---`)
    console.log(`Storage link: ${linkManager.storageLink ? linkManager.storageLink.id : 'NONE'}`)
    console.log(
        `Controller link: ${linkManager.controllerLink ? linkManager.controllerLink.id : 'NONE'}`,
    )
    console.log(`Source links: ${linkManager.sourceLinks.length}`)

    for (const link of linkManager.sourceLinks) {
        console.log(`  - ${link.id} at ${link.pos}`)
    }

    console.log(`\n--- Current Link States ---`)

    // Source links (senders)
    console.log(`\nSource Links (energy senders):`)
    for (const link of linkManager.sources) {
        const energy = link.store.getUsedCapacity(RESOURCE_ENERGY)
        const capacity = link.store.getCapacity(RESOURCE_ENERGY)
        const cooldown = link.cooldown
        console.log(`  ${link.id} at ${link.pos}:`)
        console.log(
            `    Energy: ${energy}/${capacity} (${((energy / capacity) * 100).toFixed(1)}%)`,
        )
        console.log(`    Cooldown: ${cooldown} ticks`)
        console.log(`    Can send: ${energy > 0 && cooldown === 0 ? 'YES' : 'NO'}`)
    }

    // Sink links (receivers)
    console.log(`\nSink Links (energy receivers):`)
    for (const link of linkManager.sinks) {
        const energy = link.store.getUsedCapacity(RESOURCE_ENERGY)
        const capacity = link.store.getCapacity(RESOURCE_ENERGY)
        const freeCapacity = link.store.getFreeCapacity(RESOURCE_ENERGY)
        const isStorage = link.id === linkManager.storageLink?.id
        console.log(`  ${link.id} at ${link.pos} (${isStorage ? 'STORAGE' : 'CONTROLLER'}):`)
        console.log(
            `    Energy: ${energy}/${capacity} (${((energy / capacity) * 100).toFixed(1)}%)`,
        )
        console.log(`    Free capacity: ${freeCapacity}`)
        console.log(`    Can receive: ${freeCapacity > 0 ? 'YES' : 'NO'}`)
    }

    console.log(`\n--- Transfer Logic Simulation ---`)

    const sinkTracker = linkManager.sinks.map((link) => ({
        amount: link.store.getFreeCapacity(RESOURCE_ENERGY),
        link,
    }))

    for (const source of linkManager.sources) {
        const amount = source.store.getUsedCapacity(RESOURCE_ENERGY)
        console.log(`\nSource ${source.id}:`)
        console.log(`  Energy to send: ${amount}`)

        if (amount === 0) {
            console.log(`  ❌ No energy to send`)
            continue
        }

        if (source.cooldown > 0) {
            console.log(`  ❌ On cooldown (${source.cooldown} ticks)`)
            continue
        }

        const emptySinks = sinkTracker.filter((sink) => sink.amount >= amount)
        if (emptySinks.length > 0) {
            const sink = emptySinks[0]
            console.log(`  ✅ Would send ${amount} energy to ${sink.link.id}`)
            console.log(`     Sink free capacity: ${sink.amount}`)
            continue
        }

        const fillableSinks = sinkTracker.filter((sink) => sink.amount > 0)
        if (fillableSinks.length > 0) {
            const sink = fillableSinks[0]
            console.log(`  ⚠️  Would partially fill ${sink.link.id}`)
            console.log(`     Sink free capacity: ${sink.amount} (less than ${amount})`)
            continue
        }

        console.log(`  ❌ No available sinks (all full)`)
    }

    console.log(`\n=== End Debug ===`)
}

/**
 * Debugs link position mismatches between construction features and actual links
 * @param roomName - The room to check link positions
 */
function debugLinkPositions(roomName: string): void {
    console.log(`=== Debug Link Positions: ${roomName} ===\n`)

    const room = Game.rooms[roomName]
    if (!room) {
        console.log('❌ ERROR: Room not visible')
        return
    }

    // Get all actual links in the room
    const actualLinks = room.find<StructureLink>(FIND_MY_STRUCTURES, {
        filter: { structureType: STRUCTURE_LINK },
    })

    console.log(`--- Actual Links in Room (${actualLinks.length}) ---`)
    for (const link of actualLinks) {
        console.log(`  ${link.id} at (${link.pos.x}, ${link.pos.y})`)
    }

    // Get calculated link positions from construction features
    const featuresV3 = getConstructionFeaturesV3(roomName)
    const storedLinks: Links | null =
        featuresV3 && featuresV3.type === 'base' ? featuresV3.links : null
    if (!storedLinks) {
        console.log('\n❌ No calculated link positions in construction features')
        return
    }

    console.log(`\n--- Calculated Link Positions ---`)
    console.log(`Storage link expected at: (${storedLinks.storage.x}, ${storedLinks.storage.y})`)
    console.log(
        `Controller link expected at: (${storedLinks.controller.x}, ${storedLinks.controller.y})`,
    )
    console.log(`Source links: ${storedLinks.sourceContainers.length}`)
    for (let i = 0; i < storedLinks.sourceContainers.length; i++) {
        const sc = storedLinks.sourceContainers[i]
        console.log(`  Source ${i + 1} link at: (${sc.link.x}, ${sc.link.y})`)
    }

    console.log(`\n--- Position Match Check ---`)

    // Check storage link
    const storagePos = storedLinks.storage
    const storageLinkAtPos = actualLinks.find(
        (link) => link.pos.x === storagePos.x && link.pos.y === storagePos.y,
    )
    if (storageLinkAtPos) {
        console.log(`✅ Storage link found at expected position (${storagePos.x}, ${storagePos.y})`)
        console.log(`   ID: ${storageLinkAtPos.id}`)
    } else {
        console.log(`❌ No storage link at expected position (${storagePos.x}, ${storagePos.y})`)
        const closest = actualLinks
            .map((link) => ({
                link,
                distance: Math.abs(link.pos.x - storagePos.x) + Math.abs(link.pos.y - storagePos.y),
            }))
            .sort((a, b) => a.distance - b.distance)[0]
        if (closest) {
            console.log(
                `   Closest actual link is at (${closest.link.pos.x}, ${closest.link.pos.y}) - distance ${closest.distance}`,
            )
        }
    }

    // Check controller link
    const controllerPos = storedLinks.controller
    const controllerLinkAtPos = actualLinks.find(
        (link) => link.pos.x === controllerPos.x && link.pos.y === controllerPos.y,
    )
    if (controllerLinkAtPos) {
        console.log(
            `✅ Controller link found at expected position (${controllerPos.x}, ${controllerPos.y})`,
        )
        console.log(`   ID: ${controllerLinkAtPos.id}`)
    } else {
        console.log(
            `❌ No controller link at expected position (${controllerPos.x}, ${controllerPos.y})`,
        )
        const closest = actualLinks
            .map((link) => ({
                link,
                distance:
                    Math.abs(link.pos.x - controllerPos.x) + Math.abs(link.pos.y - controllerPos.y),
            }))
            .sort((a, b) => a.distance - b.distance)[0]
        if (closest) {
            console.log(
                `   Closest actual link is at (${closest.link.pos.x}, ${closest.link.pos.y}) - distance ${closest.distance}`,
            )
        }
    }

    // Check source links
    for (let i = 0; i < storedLinks.sourceContainers.length; i++) {
        const sc = storedLinks.sourceContainers[i]
        const sourceLinkAtPos = actualLinks.find(
            (link) => link.pos.x === sc.link.x && link.pos.y === sc.link.y,
        )
        if (sourceLinkAtPos) {
            console.log(
                `✅ Source ${i + 1} link found at expected position (${sc.link.x}, ${sc.link.y})`,
            )
            console.log(`   ID: ${sourceLinkAtPos.id}`)
        } else {
            console.log(
                `❌ No source ${i + 1} link at expected position (${sc.link.x}, ${sc.link.y})`,
            )
        }
    }

    console.log(`\n--- Recommendation ---`)
    if (!storageLinkAtPos || !controllerLinkAtPos) {
        console.log(`The calculated link positions don't match actual links.`)
        console.log(`This usually means:`)
        console.log(`  1. Links were built in wrong positions`)
        console.log(`  2. Construction features are out of date`)
        console.log(`\nTo fix, you can:`)
        console.log(
            `  - Delete construction features: delete Memory.rooms['${roomName}'].constructionFeaturesV3`,
        )
        console.log(`  - Wait for surveyor to recalculate on next tick`)
        console.log(`  - Or manually rebuild links in the correct positions`)
    } else {
        console.log(`All links are in expected positions - the issue is elsewhere!`)
    }

    console.log(`\n=== End Debug ===`)
}

/**
 * Checks if a specific position is in the rampart construction features.
 * @param roomName - The room to check
 * @param x - X coordinate
 * @param y - Y coordinate
 */
function debugRampartPosition(roomName: string, x: number, y: number): void {
    const features = getConstructionFeatures(roomName)
    if (!features || !features.rampart) {
        console.log(`No rampart features found for ${roomName}`)
        return
    }

    const ramparts = features.rampart
    const index = ramparts.findIndex((pos) => pos.x === x && pos.y === y)

    if (index >= 0) {
        console.log(`✓ Rampart at (${x}, ${y}) found at index ${index} of ${ramparts.length}`)
        console.log(
            `  Priority: ${
                index < ramparts.length / 3
                    ? 'HIGH (bunker edge)'
                    : index < (ramparts.length * 2) / 3
                    ? 'MEDIUM (structure protection)'
                    : 'LOW (interior)'
            }`,
        )
    } else {
        console.log(`✗ Rampart at (${x}, ${y}) NOT FOUND in construction features`)
        console.log(`  Total ramparts in features: ${ramparts.length}`)

        // Check if it's in the bunker stamp
        const room = Game.rooms[roomName]
        if (room) {
            const terrain = room.getTerrain()
            const terrainType = terrain.get(x, y)
            console.log(
                `  Terrain: ${
                    terrainType === TERRAIN_MASK_WALL
                        ? 'wall'
                        : terrainType === TERRAIN_MASK_SWAMP
                        ? 'swamp'
                        : 'plain'
                }`,
            )
        }
    }
}

/**
 * Forces recalculation of mine construction features for a specific mine room.
 * Use this when a mine has constructionFeaturesV3 but is missing the points field.
 * @param mineName - The name of the mine room to fix
 * @param baseRoomName - Optional: the base room that should own this mine. If not provided, will search for it.
 */
function fixMineFeatures(mineName: string, baseRoomName?: string): void {
    console.log(`=== Fixing Mine Features: ${mineName} ===`)

    const memory = Memory.rooms[mineName]
    if (!memory) {
        console.log(`❌ No memory found for ${mineName}`)
        return
    }

    const features = memory.constructionFeaturesV3
    if (!features) {
        console.log(`❌ No constructionFeaturesV3 found for ${mineName}`)
        console.log(`Hint: This room has never been set up as a mine`)
        return
    }

    if (features.type !== 'mine') {
        console.log(`❌ Room is not a mine (type: ${features.type})`)
        return
    }

    console.log(`Found mine features:`)
    console.log(`  version: ${features.version}`)
    console.log(`  has points: ${!!features.points}`)
    console.log(`  has minee: ${!!features.minee}`)
    console.log(`  has features: ${!!features.features}`)

    // Find the base room that owns this mine
    let baseRoom: string | null = baseRoomName || null

    if (!baseRoom) {
        for (const [roomName, roomMem] of Object.entries(Memory.rooms)) {
            if (roomMem.mines?.some((m) => m.name === mineName)) {
                baseRoom = roomName
                break
            }
        }
    }

    if (!baseRoom) {
        console.log(`\n❌ This mine is orphaned - not listed in any room's 'mines' array`)
        console.log(`\nTo fix, you need to specify which base room owns it:`)
        console.log(`Example: global.fixMineFeatures('${mineName}', 'E56S29')`)
        console.log(`\nOr manually delete the broken features:`)
        console.log(`delete Memory.rooms['${mineName}'].constructionFeaturesV3`)
        return
    }

    const baseMemory = Memory.rooms[baseRoom]
    if (!baseMemory) {
        console.log(`❌ Base room ${baseRoom} has no memory`)
        return
    }

    // Check if the mine is in the base room's mines array
    const mineInArray = baseMemory.mines?.some((m) => m.name === mineName)
    if (!mineInArray) {
        console.log(`\n⚠️  WARNING: ${mineName} is NOT in ${baseRoom}'s mines array!`)
        console.log(`The base room doesn't know it should manage this mine.`)
        console.log(`You should either:`)
        console.log(`1. Add it to the mines array (if it should be managed)`)
        console.log(`2. Delete the mine's constructionFeaturesV3 (if it's abandoned)`)
        return
    }

    console.log(`✓ Found base room: ${baseRoom}`)
    console.log(`\nForcing recalculation by deleting base room features...`)
    delete Memory.rooms[baseRoom].constructionFeaturesV3
    console.log(`✓ Deleted ${baseRoom}.constructionFeaturesV3`)
    console.log(`\nThe surveyor will recalculate on the next tick (if CPU bucket > 1500)`)
    console.log(`Current CPU bucket: ${Game.cpu.bucket}`)
}

/**
 * Debug mineral manager for a room.
 * Shows mineral info, stationary points, and container position.
 */
function debugMineral(roomName: string): void {
    const room = Game.rooms[roomName]
    if (!room) {
        console.log(`❌ Room ${roomName} not visible`)
        return
    }

    console.log(`\n=== Mineral Debug: ${roomName} ===`)

    const mineralManager = getMineralManager(room)
    if (!mineralManager) {
        console.log(`❌ No mineral manager (missing stationary points or mineral)`)
        return
    }

    console.log(`\n✓ Mineral Manager Created`)
    console.log(`  Mineral ID: ${mineralManager.id}`)
    console.log(`  Mineral Type: ${mineralManager.mineralType}`)
    console.log(`  Current Amount: ${mineralManager.mineralAmount}`)
    console.log(`  Ticks to Regen: ${mineralManager.ticksToRegeneration ?? 'N/A'}`)
    console.log(
        `  Container Position: (${mineralManager.containerPosition.x}, ${mineralManager.containerPosition.y})`,
    )

    // Check for extractor
    const extractor = room.find(FIND_MY_STRUCTURES, {
        filter: { structureType: STRUCTURE_EXTRACTOR },
    })
    console.log(`\nExtractor: ${extractor.length > 0 ? '✓ Built' : '❌ Not built'}`)

    // Check for container
    const containers = room.lookForAt(
        LOOK_STRUCTURES,
        mineralManager.containerPosition.x,
        mineralManager.containerPosition.y,
    )
    const container = containers.find(
        (s): s is StructureContainer => s.structureType === STRUCTURE_CONTAINER,
    )
    console.log(`Container: ${container ? '✓ Built' : '❌ Not built'}`)
    if (container) {
        const used = container.store.getUsedCapacity(mineralManager.mineralType)
        const total = container.store.getCapacity()
        console.log(`  Storage: ${used}/${total} ${mineralManager.mineralType}`)
    }

    // Check storage
    console.log(`\nStorage: ${room.storage ? '✓ Built' : '❌ Not built'}`)

    // Check mineral harvester creeps
    const harvesters = mineralManager.mineralHarvesters
    console.log(`\nMineral Harvesters: ${harvesters.length}`)
    for (const harvester of harvesters) {
        const pos = harvester.pos
        const targetPos = mineralManager.containerPosition
        const atPosition =
            pos.x === targetPos.x && pos.y === targetPos.y && pos.roomName === targetPos.roomName
        console.log(`  ${harvester.name}:`)
        console.log(
            `    Position: (${pos.x}, ${pos.y}) ${atPosition ? '✓ AT TARGET' : '❌ MOVING'}`,
        )
        console.log(`    TTL: ${harvester.ticksToLive ?? 'N/A'}`)
        console.log(
            `    Store: ${harvester.store.getUsedCapacity()}/${harvester.store.getCapacity()}`,
        )
        console.log(
            `    Body: ${harvester.body.length} parts (${harvester.getActiveBodyparts(
                WORK,
            )} WORK, ${harvester.getActiveBodyparts(MOVE)} MOVE)`,
        )

        // Check if can harvest
        const mineral = Game.getObjectById(mineralManager.id)
        if (mineral) {
            const canHarvest =
                mineral.mineralAmount > 0 &&
                !(mineral.ticksToRegeneration !== undefined && mineral.ticksToRegeneration > 0)
            console.log(`    Can harvest: ${canHarvest ? '✓ YES' : '❌ NO'}`)
            if (!canHarvest) {
                if (mineral.mineralAmount <= 0) {
                    console.log(`      Reason: Mineral depleted`)
                }
                if (mineral.ticksToRegeneration !== undefined && mineral.ticksToRegeneration > 0) {
                    console.log(`      Reason: Cooldown (${mineral.ticksToRegeneration} ticks)`)
                }
            }
            if (container && container.store.getFreeCapacity() === 0) {
                console.log(`      Container full!`)
            }
        }
    }

    // Check shouldBuildMineralHarvester
    console.log(
        `\nShould build harvester: ${
            mineralManager.shouldBuildMineralHarvester() ? '✓ YES' : '❌ NO'
        }`,
    )

    // Check construction features
    const features = getConstructionFeaturesV3(room)
    if (features && features.type === 'base' && features.features) {
        const extractorPositions = features.features[STRUCTURE_EXTRACTOR] || []
        const containerPositions = features.features[STRUCTURE_CONTAINER] || []
        console.log(`\nConstruction Features:`)
        console.log(`  Extractor planned: ${extractorPositions.length > 0 ? '✓' : '❌'}`)
        if (extractorPositions.length > 0) {
            console.log(`    Position: (${extractorPositions[0].x}, ${extractorPositions[0].y})`)
        }
        const mineralContainer = containerPositions.find(
            (p) =>
                p.x === mineralManager.containerPosition.x &&
                p.y === mineralManager.containerPosition.y,
        )
        console.log(`  Mineral container planned: ${mineralContainer ? '✓' : '❌'}`)
    }
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
    global.debugLogistics = debugLogistics
    global.fixStuckAttackers = fixStuckAttackers
    global.debugAttackers = debugAttackers
    global.checkFeatureConflicts = checkFeatureConflicts
    global.fixMineFeatures = fixMineFeatures
    global.debugRampartPosition = debugRampartPosition
    global.debugSpawn = debugSpawn
    global.debugMineWorkerSpawn = debugMineWorkerSpawn
    global.debugLinks = debugLinks
    global.debugLinkPositions = debugLinkPositions
    global.debugMineral = debugMineral
    global.enableDebugCartographer = enableDebugCartographer
    global.disableDebugCartographer = disableDebugCartographer
    global.enableDebugAstar = enableDebugAstar
    global.disableDebugAstar = disableDebugAstar
    global.enableDebugCreepRun = enableDebugCreepRun
    global.disableDebugCreepRun = disableDebugCreepRun
    global.enableDebugRemoteHauler = enableDebugRemoteHauler
    global.disableDebugRemoteHauler = disableDebugRemoteHauler
}

function enableDebugCartographer(): void {
    Memory.cartographerDebugEnabled = true
    console.log(
        'Cartographer debug enabled: moveToCartographer will log creep, args, and CPU per call.',
    )
}

function disableDebugCartographer(): void {
    Memory.cartographerDebugEnabled = false
    console.log('Cartographer debug disabled.')
}

function enableDebugAstar(): void {
    Memory.astarDebugEnabled = true
    console.log(
        'A* debug enabled: moveWithinRoom and moveWithinRoomToNearest will log CPU per call.',
    )
}

function disableDebugAstar(): void {
    Memory.astarDebugEnabled = false
    console.log('A* debug disabled.')
}

function enableDebugRemoteHauler(): void {
    Memory.remoteHaulerDebugEnabled = true
    console.log('Remote hauler debug enabled: followMinePath and run state will log per tick.')
}

function disableDebugRemoteHauler(): void {
    Memory.remoteHaulerDebugEnabled = false
    console.log('Remote hauler debug disabled.')
}

function enableDebugCreepRun(): void {
    Memory.creepRunDebugEnabled = true
    console.log(
        'Creep run debug enabled: runCreep will log name, position, memory, and CPU per creep.',
    )
}

function disableDebugCreepRun(): void {
    Memory.creepRunDebugEnabled = false
    console.log('Creep run debug disabled.')
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
            debugLogistics: (roomName: string) => void
            fixStuckAttackers: () => void
            debugAttackers: () => void
            checkFeatureConflicts: (roomName: string) => void
            fixMineFeatures: (mineName: string, baseRoomName?: string) => void
            debugRampartPosition: (roomName: string, x: number, y: number) => void
            debugSpawn: (roomName: string) => void
            debugMineWorkerSpawn: (mineName: string, baseRoomName: string) => void
            debugLinks: (roomName: string) => void
            debugLinkPositions: (roomName: string) => void
            debugMineral: (roomName: string) => void
            enableDebugCartographer: () => void
            disableDebugCartographer: () => void
            enableDebugAstar: () => void
            disableDebugAstar: () => void
            enableDebugCreepRun: () => void
            disableDebugCreepRun: () => void
            enableDebugRemoteHauler: () => void
            disableDebugRemoteHauler: () => void
        }
    }
}
