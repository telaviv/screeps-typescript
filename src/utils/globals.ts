import * as Logger from 'utils/logger'
import { resetSnapshot, saveSnapshot } from 'snapshot'
import ErrorMapper from './ErrorMapper'
import { RoomManager } from 'managers/room-manager'
import { Task } from 'tasks/types'
import WarDepartment from 'war-department'
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
        }
    }
}
