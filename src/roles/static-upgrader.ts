import * as Logger from 'utils/logger'
import {
    isStationaryBase,
    getStationaryPoints,
    getStationaryPointsBase,
} from 'construction-features'
import { Position } from 'types'
import autoIncrement from 'utils/autoincrement'
import { fromBodyPlanSafe } from 'utils/parts'
import { getTotalWithdrawableResources } from 'tasks/withdraw'
import { getVirtualControllerLink } from 'utils/virtual-storage'
import { hasNoEnergy } from 'utils/energy-harvesting'
import { moveToStationaryPoint } from 'utils/creep'
import { wrap } from 'utils/profiling'

const ROLE = 'static-upgrader'
const FULL_ENERGY_THRESHOLD = 20000

export interface StaticUpgrader extends Creep {
    memory: StaticUpgraderMemory
}

interface StaticUpgraderMemory extends CreepMemory {
    role: 'static-upgrader'
    pos: Position
    sourceId: Id<StructureLink | StructureContainer>
    sinkId: Id<StructureController>
}

class StaticUpgraderCreep {
    readonly creep: StaticUpgrader

    constructor(creep: StaticUpgrader) {
        this.creep = creep
    }

    get pos(): RoomPosition {
        // god help us if the creep is in the wrong room
        return new RoomPosition(
            this.creep.memory.pos.x,
            this.creep.memory.pos.y,
            this.creep.room.name,
        )
    }

    run(): void {
        if (this.creep.spawning) {
            return
        }
        if (!this.isAtPosition()) {
            this.moveToPosition()
            return
        }

        if (hasNoEnergy(this.creep)) {
            return this.getEnergy()
        }
        return this.upgradeController()
    }

    isAtPosition(): boolean {
        return this.creep.pos.isEqualTo(this.pos)
    }

    moveToPosition(): void {
        const err = moveToStationaryPoint(this.pos, this.creep)
        if (err !== OK && err !== ERR_TIRED) {
            Logger.error('harvester:moveToHarvestPos:failure', this.creep.name, this.pos, err)
        }
    }

    getEnergy() {
        const source = Game.getObjectById<StructureLink | StructureContainer>(
            this.creep.memory.sourceId,
        )
        if (!source) {
            Logger.warning(
                'static-upgrader:get-energy:source-not-found',
                this.creep.name,
                this.creep.memory.sourceId,
            )
            return
        }
        if (source.store.getUsedCapacity(RESOURCE_ENERGY) === 0) {
            return
        }
        const err = this.creep.withdraw(source, RESOURCE_ENERGY)
        if (err !== OK) {
            Logger.warning('static-upgrader:get-energy:failed', this.creep.name, err)
        }
    }

    upgradeController(): void {
        const controller = Game.getObjectById<StructureController>(this.creep.memory.sinkId)
        if (!controller) {
            Logger.error(
                'static-upgrader:transfer-energy:sink-not-found',
                this.creep.name,
                this.creep.memory.sinkId,
            )
            return
        }
        const err = this.creep.upgradeController(controller)
        if (err !== OK) {
            Logger.warning('static-upgrader:transfer-energy:failed', this.creep.name, err)
        }
    }

    shouldUpgradeThisTick(): boolean {
        // so that all resources aren't spent on upgrading we throttle the upgrade rate
        const mod = this.getUpgradeMod(this.creep.room)
        return Game.time % mod === 0
    }

    getUpgradeMod(room: Room): number {
        const withdrawEnergy = getTotalWithdrawableResources(room)
        if (withdrawEnergy > FULL_ENERGY_THRESHOLD) {
            return 1
        }

        const total = room.energyCapacityAvailable - SPAWN_ENERGY_CAPACITY
        const available = room.energyAvailable
        if (available < total / 2) {
            return 4
        }
        if (available < total) {
            return 2
        }
        return 1
    }
}

const roleStaticUpgrader = {
    run: wrap((creep: StaticUpgrader) => {
        const runner = new StaticUpgraderCreep(creep)
        runner.run()
    }, 'runStaticUpgrader'),

    canCreate(spawn: StructureSpawn, capacity: number): boolean {
        const parts = calculateParts(capacity)
        const memory = this.getMemory(spawn.room)
        const pos = this.getPosition(spawn.room)
        return parts !== null && memory !== null && pos !== null
    },

    create(spawn: StructureSpawn, roomName: string, capacity: number): number {
        const parts = calculateParts(capacity)
        const memory = this.getMemory(spawn.room)
        const pos = this.getPosition(spawn.room)
        if (parts === null || parts.length === 0 || memory === null || pos === null) {
            Logger.error('static-upgrader:create:failed', spawn.room.name, parts, capacity, pos)
            throw new Error(`failed to create static-upgrader room ${roomName}`)
        }
        const err = spawn.spawnCreep(parts, `${ROLE}:${spawn.room.name}:${autoIncrement()}`, {
            memory,
        })
        return err
    },

    getMemory(room: Room): StaticUpgraderMemory | null {
        const points = getStationaryPoints(room)
        if (!points) {
            return null
        }
        const storage = room.controller
        const virtualLink = getVirtualControllerLink(room.name)
        if (!storage || !virtualLink) {
            return null
        }
        if (!isStationaryBase(points)) {
            throw new Error('static-upgrader: not a stationary base ' + room.name)
        }
        const pos = points.controllerLink
        return {
            role: ROLE,
            home: room.name,
            pos,
            sourceId: virtualLink.id,
            sinkId: storage.id,
            tasks: [],
        } as StaticUpgraderMemory
    },

    getPosition(room: Room): Position | null {
        const points = getStationaryPointsBase(room)
        if (points === null) {
            return null
        }
        return points.storageLink
    },
}

export function calculateParts(capacity: number): BodyPartConstant[] | null {
    return fromBodyPlanSafe(capacity, [WORK, CARRY, MOVE])
}

export default roleStaticUpgrader
