import WarDepartment from 'war-department'
import * as Logger from 'utils/logger'
import { resetSnapshot, saveSnapshot } from 'snapshot'
import roleScout from 'roles/scout'
import roleWrecker from 'roles/wrecker'
import { visualizeRoom } from 'room-visualizer'
import { getAllTasks } from 'tasks/utils'
import { RoomManager } from 'managers/room-manager'
import ErrorMapper, { trace } from './ErrorMapper'
import { Task } from 'tasks/types'

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
        throw Error(`Couldn't find room ${startRoom}`);
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

function sendScout(destination: string, startRoom: string) {
    const spawns = Game.rooms[startRoom].find(FIND_MY_SPAWNS)
    if (spawns.length === 0) {
        throw new Error('no spawn in starting room')
    }
    const err = roleScout.create(spawns[0], destination)
    Logger.info('sendScout:create', err)
}

function declareWar(endRoom: string, warRoom: string) {
    const warDepartment = new WarDepartment(Game.rooms[warRoom])
    warDepartment.declareWar(endRoom)
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

export default function assignGlobals() {
    if (!Memory.logLevel) {
        Memory.logLevel = 'warning'
    }

    global.killAllCreeps = killAllCreeps
    global.setLogLevel = Logger.setLogLevel
    global.saveSnapshot = saveSnapshot
    global.claimRoom = ErrorMapper.wrap(claimRoom)
    global.visualizeRoom = visualizeRoom
    global.assignGlobals = assignGlobals
    global.sendWrecker = sendWrecker
    global.declareWar = declareWar
    global.pauseConstruction = pauseConstruction
    global.unpauseConstruction = unpauseConstruction
    global.resetSnapshot = resetSnapshot
    global.printTasks = printTasks
    global.sendScout = sendScout
}


declare global {
    
}
