import * as Logger from 'utils/logger'

import { ResourceCreep } from '../types'
import { makeTask } from 'tasks/utils'
import { moveTo } from 'utils/creep'
import { SignTask } from './types'
import { isSignTask } from './utils'

declare global {
    interface RoomMemory {
        signed?: boolean
    }
}

const MESSAGE = "i'm learning be gentle 😿"

export function makeRequest(creep: ResourceCreep): boolean {
    const room = creep.memory.home && Game.rooms[creep.memory.home]
    if (!room) {
        Logger.warning('task:sign::makeRequest:failure:no-room', creep.name, creep.memory.home)
        return false
    }
    if (!room.controller) {
        Logger.warning('task:sign::makeRequest:failure:no-controller', creep.name, room.name)
        return false
    }

    const task = makeTask('sign', { message: MESSAGE, roomName: room.name })

    creep.memory.tasks.push(task)
    return true
}

export function run(task: SignTask, creep: ResourceCreep): boolean {
    const room = Game.rooms[task.roomName]!
    const controller = room.controller!
    const err = creep.signController(controller, task.message)
    if (err === ERR_NOT_IN_RANGE) {
        moveTo(controller.pos, creep, { range: 1 })
        return false
    } else if (err === OK) {
        room.memory.signed = true;
        return true
    }
    return false
}

export function completeRequest(creep: ResourceCreep) {
    if (!creep.memory.tasks || creep.memory.tasks.length === 0) {
        Logger.warning(
            'task:mining::complete:failure',
            creep.name,
            creep.memory.tasks,
        )
    }
    const task = creep.memory.tasks[0]
    task.complete = true
}
0
export function cleanup(task: SignTask, creep: ResourceCreep): boolean {
    const room = Game.rooms[task.roomName]
    if (!room) {
        Logger.warning('task:sign::cleanup:failure:no-room', creep.name, task)
        return true
    }
    if (room.memory.signed === true) {
        Logger.warning('task:sign::cleanup:failure:room-signed', creep.name, room.name)
        return true
    }
    return false
}

export default {
    verifyType: isSignTask,
    run,
    cleanup,
}
