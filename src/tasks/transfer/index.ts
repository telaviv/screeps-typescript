import { TransferStructure } from 'tasks/transfer/structure'
import { currentEnergyHeld } from 'utils/creep'
import * as Logger from 'utils/logger'
import { getExtensions, getSpawns, getTowers } from 'utils/room'

import { TransferTask } from './types'
import { isTransferTask } from './utils'
import { ResourceCreep } from 'tasks/types'

export function makeRequest(creep: ResourceCreep): AnyStoreStructure | null {
    const energy = currentEnergyHeld(creep)
    if (energy === 0) {
        return null
    }

    const currentRequest = getCurrentTransferRequest(creep)
    if (currentRequest !== null) {
        return getStructure(currentRequest)
    }

    const extensions = fillableExtensions(creep.room)
    if (extensions.length > 0) {
        const extension = creep.pos.findClosestByRange(extensions) as StructureExtension
        const request = addTransferTask(creep, extension)
        return getStructure(request)
    }

    const spawns = fillableSpawns(creep.room)
    if (spawns.length > 0) {
        const spawn = creep.pos.findClosestByRange(spawns) as StructureSpawn
        const request = addTransferTask(creep, spawn)
        return getStructure(request)
    }

    const towers = fillableTowers(creep.room)
    if (towers.length > 0) {
        const tower = creep.pos.findClosestByRange(towers) as StructureTower
        const request = addTransferTask(creep, tower)
        return getStructure(request)
    }

    return null
}

export function run(task: TransferTask, creep: ResourceCreep): boolean {
    const structure = getStructure(task)
    const err = creep.transfer(structure, RESOURCE_ENERGY)
    if (err === ERR_NOT_IN_RANGE) {
        creep.moveTo(structure, {
            visualizePathStyle: { stroke: '#ffffff' },
        })
    } else if (err === OK) {
        completeRequest(creep)
        return true
    } else {
        Logger.warning('task:transfer:run:failed', creep.name, err)
    }
    return false
}

function addTransferTask(creep: ResourceCreep, structure: AnyStoreStructure) {
    const transferStructure = TransferStructure.get(structure.id)
    const task = transferStructure.makeRequest(creep)
    Logger.info(
        'transfer:create',
        creep.name,
        structure.structureType,
        task.id,
        task.amount,
        task.structureId,
        structure.store.getFreeCapacity(RESOURCE_ENERGY),
    )
    creep.memory.tasks.push(task)
    return task
}

export function completeRequest(creep: ResourceCreep) {
    if (!creep.memory.tasks || creep.memory.tasks.length === 0) {
        Logger.warning('task:transfer:complete:failure', creep.name, creep.memory.tasks)
    }
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const task = creep.memory.tasks[0]
    if (isTransferTask(task)) {
        task.complete = true
    } else {
        Logger.warning('task:transfer:complete:no-transfer', creep.name, creep.memory.tasks)
    }
}

export function cleanup(task: TransferTask, creep: ResourceCreep): boolean {
    if (Game.getObjectById(task.structureId) === null) {
        Logger.warning('transfer:cleanup:failure', task.structureId, creep.name, task)
        return true
    }

    const structure = getStructure(task)
    const capacity = structure.store.getFreeCapacity(RESOURCE_ENERGY)
    return capacity === 0
}

function getCurrentTransferRequest(creep: ResourceCreep): TransferTask | null {
    if (creep.memory.tasks.length === 0) {
        return null
    }

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const currentTask = creep.memory.tasks[0]
    if (isTransferTask(currentTask)) {
        return currentTask
    }

    return null
}

function getStructure(task: TransferTask): AnyStoreStructure {
    return Game.getObjectById(task.structureId) as AnyStoreStructure
}

function fillableExtensions(room: Room): AnyStoreStructure[] {
    const extensions = getExtensions(room)
    return filterFillableStructures(extensions)
}

function fillableTowers(room: Room): AnyStoreStructure[] {
    const towers = getTowers(room)
    return towers.filter((structure) => {
        const transfer = TransferStructure.get(structure.id)
        return transfer.remainingCapacity(RESOURCE_ENERGY) >= CARRY_CAPACITY
    })
}

function fillableSpawns(room: Room): AnyStoreStructure[] {
    const spawns = getSpawns(room)
    return filterFillableStructures(spawns)
}

function filterFillableStructures(structures: AnyStoreStructure[]) {
    return structures.filter((structure) => {
        const transfer = TransferStructure.get(structure.id)
        return transfer.remainingCapacity(RESOURCE_ENERGY) > 0
    })
}

export default {
    verifyType: isTransferTask,
    run,
    cleanup,
}
