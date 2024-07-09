import * as Logger from 'utils/logger'
import { calculateBodyCost, moveTo } from 'utils/creep'
import { getCalculatedLinks, getStationaryPoints } from 'surveyor'
import { Position } from 'types'
import autoIncrement from 'utils/autoincrement'
import { byPartCount } from 'utils/parts'
import { hasNoEnergy } from 'utils/energy-harvesting'
import { wrap } from 'utils/profiling'

const ROLE = 'static-upgrader'

export interface StaticUpgrader extends Creep {
    memory: StaticUpgraderMemory
}

interface StaticUpgraderMemory extends CreepMemory {
    role: 'static-upgrader'
    pos: Position
    sourceId: Id<StructureLink>
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
        const err = moveTo(this.pos, this.creep)
        if (err !== OK && err !== ERR_TIRED) {
            Logger.error('harvester:moveToHarvestPos:failure', this.creep.name, this.pos, err)
        }
    }

    getEnergy() {
        const source = Game.getObjectById<StructureLink>(this.creep.memory.sourceId)
        if (!source) {
            Logger.warning(
                'static-upgrader:get-energy:link-not-found',
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
        if (err === ERR_NOT_ENOUGH_ENERGY) {
            throw new Error('not enough energy to make static-upgrader')
        }
        return err
    },

    getMemory(room: Room): StaticUpgraderMemory | null {
        const points = getStationaryPoints(room)
        const links = getCalculatedLinks(room)
        if (!points || !links) {
            return null
        }
        const storage = room.controller
        const link = room
            .lookForAt(LOOK_STRUCTURES, links.controller.x, links.controller.y)
            .filter((structure) => structure.structureType === STRUCTURE_LINK)[0] as
            | StructureLink
            | undefined
        if (!storage || !link) {
            return null
        }
        const pos = points.controllerLink
        return {
            role: ROLE,
            home: room.name,
            pos,
            sourceId: link.id,
            sinkId: storage.id,
            tasks: [],
        } as StaticUpgraderMemory
    },

    getPosition(room: Room): Position | null {
        const points = getStationaryPoints(room)
        if (points === null) {
            return null
        }
        return points.storageLink
    },
}

export function calculateParts(capacity: number): BodyPartConstant[] | null {
    const multiples = [16, 8, 4, 2, 1]
    for (const multiple of multiples) {
        const parts = byPartCount({ [CARRY]: multiple, [WORK]: multiple, [MOVE]: multiple })
        const cost = calculateBodyCost(parts)
        if (cost <= capacity) {
            return parts
        }
    }
    return null
}

export default roleStaticUpgrader
