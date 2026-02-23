import * as Logger from 'utils/logger'
import { MineralWithdrawTask, MineralWithdrawable } from './types'
import { getFreeCapacity, getUsedCapacity } from 'utils/store'
import { ResourceCreep } from '../types'
import { MineralWithdrawObject } from './object'
import { getMineralManager } from 'managers/mineral-manager'
import { getHome } from 'roles/utils'
import { isMineralWithdrawTask } from './utils'
import { moveToRoom, moveWithinRoom } from 'utils/travel'
import { wrap } from 'utils/profiling'

export const addMineralWithdrawTask = wrap((creep: ResourceCreep): MineralWithdrawTask | null => {
    const home = getHome(creep)
    if (!home) {
        Logger.error('mineral-withdraw:addTask:no-home', creep.name)
        return null
    }

    // Require real storage (not terminal or virtual storage)
    if (!home.storage) {
        return null
    }

    const mineralManager = getMineralManager(home)
    if (!mineralManager) {
        return null
    }

    const container = mineralManager.container
    if (!container) {
        return null
    }

    const withdrawObject = MineralWithdrawObject.get(container.id, mineralManager.id)
    const mineralType = mineralManager.mineralType

    // Don't create task if container has less than 250 minerals
    if (withdrawObject.resourcesAvailable(mineralType) < 250) {
        return null
    }

    const task = withdrawObject.makeRequest(creep, mineralType)
    if (!task) {
        return null
    }

    Logger.info(
        'mineral-withdraw:addTask:create',
        creep.name,
        task.id,
        task.withdrawId,
        task.amount,
        task.resourceType,
    )
    creep.memory.tasks.push(task)
    return task
}, 'mineral-withdraw:addTask')

export const makeRequest = wrap((creep: ResourceCreep): boolean => {
    const capacity = creep.store.getFreeCapacity()
    if (capacity <= 0) {
        return false
    }

    const currentRequest = getCurrentMineralWithdrawRequest(creep)
    if (currentRequest !== null) {
        return true
    }

    // Simply try to add a mineral withdraw task
    const task = addMineralWithdrawTask(creep)
    return task !== null
}, 'mineral-withdraw:makeRequest')

export const run = wrap((task: MineralWithdrawTask, creep: ResourceCreep): boolean => {
    const storeable = getWithdrawable(task)
    if (storeable.room && creep.room.name !== storeable.room.name) {
        moveToRoom(creep, storeable.pos.roomName)
        return false
    }
    const creepCapacity = getFreeCapacity(creep, task.resourceType)
    const amount = Math.min(task.amount, creepCapacity)
    const err = creep.withdraw(storeable, task.resourceType, amount)
    if (err === ERR_NOT_IN_RANGE) {
        moveWithinRoom(creep, { pos: storeable.pos, range: 1 })
    } else if (err === OK) {
        Logger.info('mineral-withdraw:complete', creep.name, task.amount, task.resourceType)
        completeRequest(creep)
        return true
    } else if (err !== ERR_BUSY) {
        Logger.info('mineral-withdraw:run:failed', creep.name, err)
    }
    return false
}, 'task:mineral-withdraw:run')

export function completeRequest(creep: ResourceCreep): void {
    if (!creep.memory.tasks || creep.memory.tasks.length === 0) {
        Logger.warning('mineral-withdraw:complete:failure', creep.name, creep.memory.tasks)
    }
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const task = creep.memory.tasks[0]
    if (isMineralWithdrawTask(task)) {
        task.complete = true
    } else {
        Logger.warning(
            'mineral-withdraw:complete:no-mineral-withdraw',
            creep.name,
            creep.memory.tasks,
        )
    }
}

export function cleanup(task: MineralWithdrawTask, creep: Creep): boolean {
    if (Game.getObjectById(task.withdrawId) === null) {
        Logger.info('mineral-withdraw:cleanup:failure', task.withdrawId, creep.name, task)
        return true
    }

    const withdrawable = getWithdrawable(task)
    const withdrawCapacity = getUsedCapacity(withdrawable, task.resourceType)
    const creepCapacity = getFreeCapacity(creep, task.resourceType)
    const ret = withdrawCapacity === 0 || creepCapacity === 0
    if (ret) {
        Logger.info(
            'mineral-withdraw:cleanup:capacity-failure',
            withdrawCapacity,
            creepCapacity,
            creep.name,
            task.amount,
            task.resourceType,
        )
    }
    return ret
}

function getCurrentMineralWithdrawRequest(creep: ResourceCreep): MineralWithdrawTask | null {
    if (creep.memory.tasks.length === 0) {
        return null
    }

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const currentTask = creep.memory.tasks[0]
    if (isMineralWithdrawTask(currentTask)) {
        return currentTask
    }

    return null
}

function getWithdrawable(task: MineralWithdrawTask): MineralWithdrawable {
    return Game.getObjectById(task.withdrawId) as MineralWithdrawable
}

/** Returns total unclaimed mineral resources in a room */
export function getTotalWithdrawableMinerals(room: Room): number {
    const mineralManager = getMineralManager(room)
    if (!mineralManager) {
        return 0
    }
    const withdrawObjects = MineralWithdrawObject.getTargetsInRoom(room)
    return withdrawObjects.reduce(
        (acc, target) => acc + target.resourcesAvailable(mineralManager.mineralType),
        0,
    )
}

export default {
    verifyType: isMineralWithdrawTask,
    run,
    cleanup,
}
