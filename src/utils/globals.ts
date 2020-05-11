import WarDepartment from 'war-department'
import * as Logger from 'utils/logger'
import { saveSnapshot } from 'snapshot'
import roleClaimer from 'roles/claim'
import roleWrecker from 'roles/wrecker'
import { visualizeRoom } from 'room-visualizer'
import { getAllTasks } from 'tasks/utils'

function killAllCreeps(roomName: string) {
    Object.values(Game.creeps).forEach(creep => {
        if (creep.room.name === roomName) {
            creep.suicide()
        }
    })
}

function claimRoom(endRoom: string, startRoom: string) {
    const spawns = Game.rooms[startRoom].find(FIND_MY_SPAWNS)
    if (spawns.length === 0) {
        throw new Error('no spawn in starting room')
    }
    const err = roleClaimer.create(spawns[0], endRoom)
    Logger.info('claimRoom:create', err)
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

function printTasks(type?: string) {
    for (const task of getAllTasks()) {
        if (type && task !== type) {
            continue
        }
        console.log(JSON.stringify(task))
    }
}

export default function assignGlobals() {
    global.killAllCreeps = killAllCreeps
    if (!Memory.logLevel) {
        Memory.logLevel = 'warning'
    }
    global.setLogLevel = Logger.setLogLevel
    global.saveSnapshot = saveSnapshot
    global.claimRoom = claimRoom
    global.visualizeRoom = visualizeRoom
    global.assignGlobals = assignGlobals
    global.sendWrecker = sendWrecker
    global.declareWar = declareWar
    global.printTasks = printTasks
}
