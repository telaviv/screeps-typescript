/* eslint @typescript-eslint/no-explicit-any: ["off"] */

import filter from 'lodash/filter'
import includes from 'lodash/includes'
import { Logistics } from 'roles/logistics-constants'
import { TransferTask } from 'tasks'
import { currentEnergyHeld } from 'utils/creep'
import * as Logger from 'utils/logger'
import { getExtensions, getTowers, getSpawns } from 'utils/room'
import { TransferStructure } from 'tasks/transfer'

export default class EnergySinkManager {
    tasks: Task<any>[]

    constructor(tasks: Task<any>[]) {
        this.tasks = tasks
    }

    static create() {
        return new EnergySinkManager(Memory.tasks)
    }

    static get() {
        return EnergySinkManager.create()
    }

    static transfersAreFull(room: Room): boolean {
        const targets = room.find(FIND_STRUCTURES, {
            filter: EnergySinkManager.needsEnergy,
        })
        return targets.length === 0
    }

    static canRepairNonWalls(room: Room): boolean {
        const targets = room.find(FIND_STRUCTURES, {
            filter: EnergySinkManager.isRepairableNonWall,
        })
        return targets.length > 0
    }

    static findRepairTarget(creep: Logistics): Structure | null {
        const targets = creep.room.find(FIND_STRUCTURES, {
            filter: EnergySinkManager.isRepairableNonWall,
        })
        if (targets.length === 0) {
            return null
        }
        return creep.pos.findClosestByRange(targets) as Structure
    }

    get transferTasks(): TransferTask[] {
        return filter(this.tasks, { type: 'transfer' }).map(task => {
            return (task as unknown) as TransferTask
        })
    }

    makeTransferRequest(creep: Logistics): AnyStoreStructure | null {
        const energy = currentEnergyHeld(creep)
        if (energy === 0) {
            return null
        }

        const currentRequest = this.getCurrentTransferRequest(creep)
        if (currentRequest !== null) {
            return EnergySinkManager.structureFromTask(currentRequest)
        }

        const extensions = EnergySinkManager.fillableExtensions(creep.room)
        if (extensions.length > 0) {
            const extension = creep.pos.findClosestByRange(
                extensions,
            ) as StructureExtension
            const request = this.makeRequest(creep, extension)
            return EnergySinkManager.structureFromTask(request)
        }

        const spawns = EnergySinkManager.fillableSpawns(creep.room)
        if (spawns.length > 0) {
            const spawn = creep.pos.findClosestByRange(spawns) as StructureSpawn
            const request = this.makeRequest(creep, spawn)
            return EnergySinkManager.structureFromTask(request)
        }

        const towers = EnergySinkManager.fillableTowers(creep.room)
        if (towers.length > 0) {
            const tower = creep.pos.findClosestByRange(towers) as StructureTower
            const request = this.makeRequest(creep, tower)
            return EnergySinkManager.structureFromTask(request)
        }

        return null
    }

    completeTransferRequest(creep: Logistics) {
        const index = this.tasks.findIndex(task =>
            EnergySinkManager.isCreepTransferTask(task, creep),
        )
        if (index === -1) {
            throw new Error(
                `couldn't complete transfer request for ${creep.name}`,
            )
        }
        const task = this.tasks.splice(index, 1)
        const transferTask = (task[0] as unknown) as TransferTask
        const structure = EnergySinkManager.structureFromTask(transferTask)
        Logger.info(
            'transfer:complete',
            transferTask.creep,
            structure.structureType,
            transferTask.amount,
        )
    }

    cleanup() {
        let index = this.tasks.findIndex(EnergySinkManager.needsCleanup)
        while (index !== -1) {
            const task = this.tasks.splice(index, 1)
            const transferTask = (task[0] as unknown) as TransferTask
            const structure = EnergySinkManager.structureFromTask(transferTask)
            if (structure.structureType !== STRUCTURE_SPAWN) {
                Logger.warning(
                    'transfer:cleanup',
                    transferTask.creep,
                    structure.structureType,
                    transferTask.amount,
                )
            }
            index = this.tasks.findIndex(EnergySinkManager.needsCleanup)
        }
    }

    private static isCreepTransferTask(task: Task<any>, creep: Creep) {
        if (task.type !== 'transfer') {
            return false
        }

        const transferTask = (task as unknown) as TransferTask
        const val = transferTask.creep === creep.name
        return val
    }

    private static needsCleanup(task: Task<any>): boolean {
        if (task.type !== 'transfer') {
            return false
        }

        const transferTask = (task as unknown) as TransferTask
        if (!(transferTask.creep in Game.creeps)) {
            return true
        }

        if (Game.getObjectById(transferTask.structureId) === null) {
            return true
        }

        const structure = EnergySinkManager.structureFromTask(transferTask)
        const capacity = structure.store.getFreeCapacity(RESOURCE_ENERGY)
        if (capacity === 0) {
            return true
        }

        return false
    }

    private makeRequest(creep: Logistics, structure: AnyStoreStructure) {
        const transferStructure = TransferStructure.get(structure.id)
        const task = transferStructure.makeRequest(creep)
        Logger.info(
            'transfer:create',
            creep.name,
            structure.structureType,
            task.amount,
        )
        this.tasks.push(task)
        return task
    }

    private static fillableExtensions(room: Room): AnyStoreStructure[] {
        const extensions = getExtensions(room)
        return EnergySinkManager.filterFillableStructures(extensions)
    }

    private static fillableTowers(room: Room): AnyStoreStructure[] {
        const towers = getTowers(room)
        return EnergySinkManager.filterFillableStructures(towers)
    }

    private static fillableSpawns(room: Room): AnyStoreStructure[] {
        const spawns = getSpawns(room)
        return EnergySinkManager.filterFillableStructures(spawns)
    }

    private static filterFillableStructures(structures: AnyStoreStructure[]) {
        return structures.filter(structure => {
            const transfer = TransferStructure.get(structure.id)
            return transfer.remainingCapacity(RESOURCE_ENERGY) > 0
        })
    }

    private getCurrentTransferRequest(creep: Creep): TransferTask | null {
        const tasks = this.tasks.filter(task =>
            EnergySinkManager.isCreepTransferTask(task, creep),
        )
        if (tasks.length > 1) {
            throw new Error(`creep ${creep.name} has ${tasks.length} requests`)
        }
        if (tasks.length === 0) {
            return null
        }

        return (tasks[0] as unknown) as TransferTask
    }

    private static structureFromTask(task: TransferTask): AnyStoreStructure {
        return Game.getObjectById(task.structureId) as AnyStoreStructure
    }

    private static isRepairableNonWall(structure: Structure): boolean {
        if (
            includes(
                [STRUCTURE_RAMPART, STRUCTURE_WALL, STRUCTURE_ROAD],
                structure.structureType,
            )
        ) {
            return false
        }
        const hitsDifference = structure.hitsMax - structure.hits
        if (structure.structureType === STRUCTURE_TOWER) {
            return hitsDifference >= 50
        }
        return hitsDifference > 0
    }

    private static needsEnergy(structure: Structure): boolean {
        if (
            structure.structureType === STRUCTURE_EXTENSION ||
            structure.structureType === STRUCTURE_SPAWN ||
            structure.structureType === STRUCTURE_TOWER
        ) {
            const s = structure as
                | StructureExtension
                | StructureSpawn
                | StructureTower
            return s.energy < s.energyCapacity
        }
        return false
    }
}
