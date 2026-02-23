import * as Logger from 'utils/logger'
import { getExtensions, getSpawns, getTowers } from 'utils/room'
import { moveToRoom, moveWithinRoom } from 'utils/travel'
import { MINIMUM_EXTENSION_ENERGY } from 'roles/logistics-constants'
import { ResourceCreep } from 'tasks/types'
import { TransferStructure } from 'tasks/transfer/structure'
import { TransferTask } from './types'
import { currentEnergyHeld } from 'utils/creep'
import { getVirtualStorage } from 'utils/virtual-storage'
import { isTransferTask } from './utils'
import { wrap } from 'utils/profiling'

interface RequestOpts {
    structure?: AnyStoreStructure
    excludeVirtualStorage?: boolean
}
/**
 * Finds a structure needing energy and creates a transfer task.
 * Priority: towers (if extensions filled) > extensions > spawns.
 */
export const makeRequest = wrap(
    (creep: ResourceCreep, opts?: RequestOpts): AnyStoreStructure | null => {
        const energy = currentEnergyHeld(creep)
        if (energy === 0) {
            return null
        }

        const currentRequest = getCurrentTransferRequest(creep)
        if (currentRequest !== null) {
            return getStructure(currentRequest)
        }

        if (opts && opts.structure) {
            const fillable = filterFillableStructures([opts.structure], opts)
            if (fillable.length === 0) {
                return null
            }
            const request = addTransferTask(creep, fillable[0])
            return getStructure(request)
        }

        if (
            creep.room.energyAvailable >
            Math.min(MINIMUM_EXTENSION_ENERGY, creep.room.energyCapacityAvailable * 0.75)
        ) {
            const towers = fillableTowers(creep.room)
            if (towers.length > 0) {
                const tower = creep.pos.findClosestByRange(towers) as StructureTower
                const request = addTransferTask(creep, tower)
                return getStructure(request)
            }
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

        return null
    },
    'transfer:makeRequest',
)

export const run = wrap((task: TransferTask, creep: ResourceCreep): boolean => {
    const structure = getStructure(task)
    if (structure.room && creep.room.name !== structure.room.name) {
        moveToRoom(creep, structure.pos.roomName)
        return false
    }
    const err = creep.transfer(structure, RESOURCE_ENERGY)
    if (err === ERR_NOT_IN_RANGE) {
        moveWithinRoom(creep, { pos: structure.pos, range: 1 })
    } else if (err === OK) {
        completeRequest(creep)
        return true
    } else {
        Logger.warning('task:transfer:run:failed', creep.name, err)
    }
    return false
}, 'task:transfer:run')

const addTransferTask = wrap((creep: ResourceCreep, structure: AnyStoreStructure) => {
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
}, 'transfer:addTransferTask')

export function completeRequest(creep: ResourceCreep): void {
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

const fillableExtensions = wrap((room: Room): AnyStoreStructure[] => {
    if (room.energyAvailable === room.energyCapacityAvailable) {
        return []
    }
    const extensions = getExtensions(room)
    return filterFillableStructures(extensions)
}, 'transfer:fillableExtensions')

const fillableTowers = wrap((room: Room): AnyStoreStructure[] => {
    const towers = getTowers(room)
    return towers.filter((structure) => {
        const transfer = TransferStructure.get(structure.id)
        return transfer.remainingCapacity(RESOURCE_ENERGY) >= CARRY_CAPACITY
    })
}, 'transfer:fillableTowers')

const fillableSpawns = wrap((room: Room): AnyStoreStructure[] => {
    const spawns = getSpawns(room)
    return filterFillableStructures(spawns)
}, 'transfer:fillableSpawns')

/** Filters structures that have free capacity not already claimed by pending tasks */
function filterFillableStructures(
    structures: AnyStoreStructure[],
    opts?: RequestOpts,
): AnyStoreStructure[] {
    if (structures.length === 0) {
        return []
    }
    const virtualStorage = getVirtualStorage(structures[0].room.name)
    const transferStructures = TransferStructure.getAllStructures()
    return structures.filter((structure) => {
        if (structure.store.getFreeCapacity(RESOURCE_ENERGY) === 0) {
            return false
        }
        if (opts?.excludeVirtualStorage && virtualStorage && structure.id === virtualStorage.id) {
            return false
        }
        const transfer = transferStructures[structure.id] ?? new TransferStructure(structure, [])
        return transfer.remainingCapacity(RESOURCE_ENERGY) > 0
    })
}

export default {
    verifyType: isTransferTask,
    run,
    cleanup,
}
