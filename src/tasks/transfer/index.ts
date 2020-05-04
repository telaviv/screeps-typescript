import { Task } from 'tasks/constants'
import { TransferStructure } from 'tasks/transfer/structure'
import { LogisticsCreep } from 'roles/logistics-constants'
import { currentEnergyHeld } from 'utils/creep'
import * as Logger from 'utils/logger'
import { getExtensions, getTowers, getSpawns } from 'utils/room'

import { TransferTask } from './types'
import { isTransferTask } from './utils'

export function makeRequest(creep: LogisticsCreep): AnyStoreStructure | null {
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
        const extension = creep.pos.findClosestByRange(
            extensions,
        ) as StructureExtension
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

function addTransferTask(creep: LogisticsCreep, structure: AnyStoreStructure) {
    const transferStructure = TransferStructure.get(structure.id)
    const task = transferStructure.makeRequest(creep)
    Logger.info(
        'transfer:create',
        creep.name,
        structure.structureType,
        task.amount,
        task.structureId,
        structure.store.getFreeCapacity(RESOURCE_ENERGY),
    )
    creep.memory.tasks.push(task)
    return task
}

export function completeRequest(creep: LogisticsCreep) {
    if (!creep.memory.tasks || creep.memory.tasks.length === 0) {
        Logger.warning(
            'task:transfer:complete:failure',
            creep.name,
            creep.memory.tasks,
        )
    }
    const task = creep.memory.tasks[0]
    if (isTransferTask(task)) {
        task.complete = true
        creep.memory.tasks.shift()
    } else {
        Logger.warning(
            'task:transfer:complete:no-transfer',
            creep.name,
            creep.memory.tasks,
        )
    }
}

export function cleanup(task: TransferTask): boolean {
    if (task.complete) {
        return true
    }

    const structure = getStructure(task)
    const capacity = structure.store.getFreeCapacity(RESOURCE_ENERGY)
    return capacity === 0
}

function getCurrentTransferRequest(creep: Creep): TransferTask | null {
    if (creep.memory.tasks.length === 0) {
        return null
    }

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
    return towers.filter(structure => {
        const transfer = TransferStructure.get(structure.id)
        return transfer.remainingCapacity(RESOURCE_ENERGY) >= CARRY_CAPACITY
    })
}

function fillableSpawns(room: Room): AnyStoreStructure[] {
    const spawns = getSpawns(room)
    return filterFillableStructures(spawns)
}

function filterFillableStructures(structures: AnyStoreStructure[]) {
    return structures.filter(structure => {
        const transfer = TransferStructure.get(structure.id)
        return transfer.remainingCapacity(RESOURCE_ENERGY) > 0
    })
}
