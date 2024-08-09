import * as Logger from 'utils/logger'
import { MiningTask } from './types'
import { ResourceCreep } from '../types'
import SourcesManager from 'managers/sources-manager'
import autoIncrement from 'utils/autoincrement'
import { isMiningTask } from './utils'
import { moveTo } from 'utils/travel'
import { wrap } from 'utils/profiling'

export const makeRequest = wrap((creep: ResourceCreep): boolean => {
    const capacity = creep.store.getFreeCapacity(RESOURCE_ENERGY)
    if (capacity <= 0) {
        return false
    }

    const currentRequest = getCurrentMiningRequest(creep)
    if (currentRequest !== null) {
        return true
    }

    const sourcesManager = new SourcesManager(creep.room)
    const target = sourcesManager.getNextAuxHarvesterMiningTarget()
    if (target) {
        addMiningTask(creep, target)
        return true
    }
    return false
}, 'mining:makeRequest')

export function run(task: MiningTask, creep: ResourceCreep): boolean {
    const source = Game.getObjectById<Source>(task.source)
    if (!source) {
        Logger.error('task:mining:run:sourceNotFound', task.source)
        return false
    }
    if (creep.store.getFreeCapacity(RESOURCE_ENERGY) === 0) {
        Logger.info('task:mining:complete', creep.name, JSON.stringify(task.pos))
        completeRequest(creep)
        return true
    }
    const err = creep.harvest(source)
    if (err === ERR_NOT_IN_RANGE) {
        const moveToError = moveTo(
            creep,
            { pos: new RoomPosition(task.pos.x, task.pos.y, task.pos.roomName), range: 0 },
            { visualizePathStyle: { stroke: '#ffaa00' } },
        )
        return moveToError === OK
    } else if (err !== OK) {
        Logger.warning(`task:mining:run:harvest:failed ${creep.name}: ${err}`)
    }
    return false
}

function addMiningTask(
    creep: ResourceCreep,
    target: { source: Id<Source>; pos: RoomPosition },
): MiningTask {
    const task = {
        type: 'mining' as const,
        id: autoIncrement().toString(),
        creep: creep.name,
        source: target.source,
        pos: {
            x: target.pos.x,
            y: target.pos.y,
            roomName: target.pos.roomName,
        },
        timestamp: Game.time,
        complete: false,
    }
    creep.memory.tasks.push(task)
    return task
}

export function completeRequest(creep: ResourceCreep): void {
    if (!creep.memory.tasks || creep.memory.tasks.length === 0) {
        Logger.warning('task:mining::complete:failure', creep.name, creep.memory.tasks)
    }
    const task = creep.memory.tasks[0]
    task.complete = true
}

export function cleanup(task: MiningTask, creep: ResourceCreep): boolean {
    const source = Game.getObjectById<Source>(task.source)
    if (!source) {
        Logger.error('task:mining:cleanup:sourceNotFound', task)
        return true
    }
    if (source.energy === 0) {
        Logger.info('task:mining:cleanup:empty', creep.name, JSON.stringify(task.pos))
        return true
    }

    return false
}

function getCurrentMiningRequest(creep: ResourceCreep): MiningTask | null {
    if (creep.memory.tasks.length === 0) {
        return null
    }

    const currentTask = creep.memory.tasks[0]
    if (isMiningTask(currentTask)) {
        return currentTask
    }

    return null
}

export default {
    verifyType: isMiningTask,
    run,
    cleanup,
}
