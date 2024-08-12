import { moveTo } from 'screeps-cartographer'

import * as Logger from 'utils/logger'
import { ResourceCreep } from '../types'
import { TravelTask } from './types'
import autoIncrement from 'utils/autoincrement'
import { getConstructionFeaturesV3 } from 'construction-features'
import { isTravelTask } from './utils'
import { moveToRoom } from 'utils/travel'
import { wrap } from 'utils/profiling'

export const makeRequest = wrap((creep: ResourceCreep, destination: string): boolean => {
    addTravelTask(creep, destination)
    return true
}, 'travel:makeRequest')

export function run(task: TravelTask, creep: ResourceCreep): boolean {
    if (
        creep.room.name === task.destination &&
        creep.pos.inRangeTo(25, 25, 23) &&
        getConstructionFeaturesV3(creep.room)
    ) {
        if (task.permanent) {
            return false
        }
        completeRequest(creep)
        return true
    }
    let err = moveToRoom(creep, task.destination)
    if (err === ERR_NO_PATH) {
        err = moveTo(creep, new RoomPosition(25, 25, task.destination), {
            swampCost: 5,
            avoidSourceKeepers: true,
        })
        if (err === ERR_NO_PATH) {
            creep.suicide()
        }
    }
    return false
}

function addTravelTask(creep: ResourceCreep, destination: string): TravelTask {
    const task = createTravelTask(creep.name, destination)
    creep.memory.tasks.push(task)
    return task
}

export function createTravelTask(
    creepName: string,
    destination: string,
    permanent = false,
): TravelTask {
    return {
        type: 'travel',
        id: autoIncrement().toString(),
        creep: creepName,
        destination,
        timestamp: Game.time,
        permanent,
        complete: false,
    }
}

export function completeRequest(creep: ResourceCreep): void {
    if (!creep.memory.tasks || creep.memory.tasks.length === 0) {
        Logger.warning('task:travel::complete:failure', creep.name, creep.memory.tasks)
    }
    const task = creep.memory.tasks[0]
    task.complete = true
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function cleanup(task: TravelTask, creep: ResourceCreep): boolean {
    return false
}

export default {
    verifyType: isTravelTask,
    run,
    cleanup,
}
