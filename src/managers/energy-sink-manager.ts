/* eslint @typescript-eslint/no-explicit-any: ["off"] */

import includes from 'lodash/includes'
import { Logistics } from 'roles/logistics-constants'
import { TransferTask } from 'tasks'
import { currentEnergyHeld } from 'utils/creep'
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

    makeTransferRequest(creep: Logistics): AnyStoreStructure | null {
        const energy = currentEnergyHeld(creep)
        if (energy === 0) {
            return null
        }

        const currentRequest = this.getCurrentRequest(creep)
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

        const towers = EnergySinkManager.fillableTowers(creep.room)
        if (towers.length > 0) {
            const tower = creep.pos.findClosestByRange(towers) as StructureTower
            const request = this.makeRequest(creep, tower)
            return EnergySinkManager.structureFromTask(request)
        }

        const spawns = EnergySinkManager.fillableSpawns(creep.room)
        if (spawns.length > 0) {
            const spawn = creep.pos.findClosestByRange(spawns) as StructureSpawn
            const request = this.makeRequest(creep, spawn)
            return EnergySinkManager.structureFromTask(request)
        }

        return null
    }

    private makeRequest(creep: Logistics, structure: AnyStoreStructure) {
        const transferStructure = TransferStructure.get(structure.id)
        const task = transferStructure.makeRequest(creep)
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

    private getCurrentRequest(creep: Creep): TransferTask | null {
        const tasks = this.tasks.filter(task => {
            if (task.type !== 'transfer') {
                return false
            }
            const transferTask = (task as unknown) as TransferTask
            return transferTask.creep === creep.name
        })
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
                [STRUCTURE_RAMPART, STRUCTURE_WALL],
                structure.structureType,
            )
        ) {
            return false
        }
        return structure.hits < structure.hitsMax
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
