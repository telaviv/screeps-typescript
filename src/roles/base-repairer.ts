import * as Logger from 'utils/logger'
import { profile } from 'utils/profiling'
import { moveToParkingSpot, moveWithinRoom } from 'utils/travel'
import { MatrixCacheManager } from 'matrix-cache'
import { LogisticsCreep, LogisticsPreference, PREFERENCE_WORKER } from './logistics-constants'
import { hasNoEnergy } from 'utils/energy-harvesting'
import { getVirtualStorage } from 'utils/virtual-storage'
import { FlatRoomPosition } from 'types'

export const ROLE = 'base-repairer'

export interface BaseRepairerMemory extends CreepMemory {
    role: 'base-repairer'
    home: string
    formerPreference: LogisticsPreference
    currentTarget?: Id<Structure>
    preference?: LogisticsPreference
    currentTask?: string
    idleTimestamp?: number | null
}

export interface BaseRepairerCreep extends Creep {
    memory: BaseRepairerMemory
}

export function isBaseRepairer(creep: Creep): creep is BaseRepairerCreep {
    return creep.memory.role === 'base-repairer'
}

/**
 * Converts a logistics creep to a base-repairer.
 * Stores the original preference so it can be restored later.
 */
export function convertLogisticsToBaseRepairer(
    creep: LogisticsCreep,
    preference?: LogisticsPreference,
): void {
    Logger.info('base-repairer:convert-from-logistics', creep.name, preference)

    const savedPreference = preference || creep.memory.preference || PREFERENCE_WORKER

    creep.memory.role = 'base-repairer'
    ;(creep.memory as BaseRepairerMemory).formerPreference = savedPreference
    ;(creep.memory as BaseRepairerMemory).currentTask = undefined
    ;(creep.memory as BaseRepairerMemory).idleTimestamp = null
}

class RoleBaseRepairer {
    private creep: BaseRepairerCreep

    public constructor(creep: BaseRepairerCreep) {
        this.creep = creep
    }

    @profile
    public run(): void {
        // Check if spawning
        if (this.creep.spawning) {
            return
        }

        // Get the base defense matrix
        const matrix: CostMatrix | null = MatrixCacheManager.getBaseDefenseBounds(
            this.creep.room.name,
        )

        // If creep is outside base bounds, move inside first
        if (matrix && !this.isInsideBase(matrix, this.creep.pos)) {
            this.moveToSpawn()
            return
        }

        // Get energy if needed
        if (hasNoEnergy(this.creep)) {
            this.getEnergy()
            return
        }

        // Repair walls
        this.repairWalls()
    }

    @profile
    private getEnergy(): void {
        const virtualStorage = getVirtualStorage(this.creep.room.name)

        if (!virtualStorage || virtualStorage.store.getUsedCapacity(RESOURCE_ENERGY) === 0) {
            // No energy available, wait near spawn
            this.waitNearSpawn()
            return
        }

        const withdrawResult = this.creep.withdraw(virtualStorage, RESOURCE_ENERGY)

        if (withdrawResult === ERR_NOT_IN_RANGE) {
            moveWithinRoom(this.creep, { pos: virtualStorage.pos, range: 1 })
        } else if (withdrawResult !== OK) {
            Logger.warning('base-repairer:withdraw:failure', this.creep.name, withdrawResult)
        }
    }

    @profile
    private repairWalls(): void {
        // Find or validate repair target
        const structure = this.getRepairTarget()

        if (!structure) {
            // No repair targets, wait near spawn
            this.waitNearSpawn()
            return
        }

        this.performRepair(structure)
    }

    @profile
    private getRepairTarget(): Structure | null {
        // Check if current target is still valid
        if (this.creep.memory.currentTarget) {
            const structure = Game.getObjectById(this.creep.memory.currentTarget)
            if (structure && structure.hits < structure.hitsMax) {
                return structure
            }
            // Current target invalid or fully repaired
            this.creep.memory.currentTarget = undefined
        }

        // Find new target from pre-computed list
        return this.findClosestRepairTarget()
    }

    @profile
    private findClosestRepairTarget(): Structure | null {
        const repairTargets: FlatRoomPosition[] =
            this.creep.room.memory.baseDefense?.repairTargets || []

        if (repairTargets.length === 0) {
            return null
        }

        // Find closest repairable structure from the list
        let closestStructure: Structure | null = null
        let closestDistance = Infinity

        for (const targetPos of repairTargets) {
            const structures = this.creep.room.lookForAt(LOOK_STRUCTURES, targetPos.x, targetPos.y)

            for (const structure of structures) {
                if (
                    (structure.structureType === STRUCTURE_WALL ||
                        structure.structureType === STRUCTURE_RAMPART) &&
                    structure.hits < structure.hitsMax
                ) {
                    const distance = this.creep.pos.getRangeTo(structure.pos)
                    if (distance < closestDistance) {
                        closestDistance = distance
                        closestStructure = structure
                    }
                }
            }
        }

        if (closestStructure) {
            this.creep.memory.currentTarget = closestStructure.id
        }

        return closestStructure
    }

    @profile
    private performRepair(structure: Structure): void {
        const repairResult = this.creep.repair(structure)

        if (repairResult === ERR_NOT_IN_RANGE) {
            moveToParkingSpot(this.creep, { pos: structure.pos, range: 3 })
        } else if (repairResult !== OK) {
            Logger.warning('base-repairer:repair:failure', this.creep.name, repairResult)
            this.creep.memory.currentTarget = undefined
        }
    }

    @profile
    private isInsideBase(matrix: CostMatrix, pos: RoomPosition): boolean {
        return matrix.get(pos.x, pos.y) < 255
    }

    @profile
    private getMovementOptions(_matrix: CostMatrix): {
        costCallback: (roomName: string) => CostMatrix | undefined
    } {
        return {
            costCallback: (roomName: string) =>
                roomName === this.creep.room.name ? _matrix : undefined,
        }
    }

    @profile
    private waitNearSpawn(): void {
        const spawn = this.creep.room.find(FIND_MY_SPAWNS)[0]
        if (!spawn) {
            return
        }

        if (this.creep.pos.getRangeTo(spawn) > 3) {
            moveWithinRoom(this.creep, { pos: spawn.pos, range: 3 })
        }
    }

    @profile
    private moveToSpawn(): void {
        const spawn = this.creep.room.find(FIND_MY_SPAWNS)[0]
        if (!spawn) {
            return
        }

        moveWithinRoom(this.creep, { pos: spawn.pos, range: 1 })
    }

    /**
     * Transforms this base-repairer back to a logistics creep.
     * Restores the original preference from memory.
     */
    @profile
    public transformToLogistics(): void {
        Logger.info('base-repairer:transform-to-logistics', this.creep.name)

        const formerPreference = this.creep.memory.formerPreference || PREFERENCE_WORKER

        // Type assertion to allow role change
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
        ;(this.creep.memory as any).role = 'logistics'
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
        ;(this.creep.memory as any).preference = formerPreference
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
        ;(this.creep.memory as any).currentTask = 'no-task'
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
        ;(this.creep.memory as any).idleTimestamp = null
        this.creep.memory.formerPreference = PREFERENCE_WORKER
        this.creep.memory.currentTarget = undefined
    }

    /**
     * Static method to transform a base-repairer creep to logistics.
     * Can be called without instantiating the class.
     */
    public static transformToLogistics(creep: BaseRepairerCreep): void {
        new RoleBaseRepairer(creep).transformToLogistics()
    }

    public static staticRun(creep: BaseRepairerCreep): void {
        new RoleBaseRepairer(creep).run()
    }
}

export default {
    run: (creep: BaseRepairerCreep): void => RoleBaseRepairer.staticRun(creep),
}
