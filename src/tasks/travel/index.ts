import * as Logger from 'utils/logger'
import { ResourceCreep } from '../types'
import { TravelTask } from './types'
import autoIncrement from 'utils/autoincrement'
import { isTravelTask } from './utils'
import { wrap } from 'utils/profiling'

export const makeRequest = wrap((creep: ResourceCreep, destination: string): boolean => {
    addTravelTask(creep, destination)
    return true
}, 'travel:makeRequest')

export function run(task: TravelTask, creep: ResourceCreep): boolean {
    if (creep.room.name === task.destination && creep.pos.inRangeTo(25, 25, 18)) {
        if (task.permanent) {
            return false
        }
        completeRequest(creep)
        return true
    }
    creep.moveTo(new RoomPosition(25, 25, task.destination), { range: 18 })
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
