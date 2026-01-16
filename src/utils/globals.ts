import * as Logger from 'utils/logger'
import { canMine } from 'managers/mine-manager'
import { getConstructionFeaturesV3 } from 'construction-features'
import { resetSnapshot, saveSnapshot } from 'snapshot'
import Empire from 'empire'
import ErrorMapper from './ErrorMapper'
import { RoomManager } from 'managers/room-manager'
import { Task } from 'tasks/types'
import WarDepartment from 'war-department'
import { findMyRooms } from './room'
import { getAllTasks } from 'tasks/utils'
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
        .filter(([_, mem]) => mem.mines?.some(m => m.name === roomName))
        .map(([name, _]) => name)
    console.log(`Assigned as mine to: ${mines.length > 0 ? mines.join(', ') : 'none'}`)
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
        }
    }
}
