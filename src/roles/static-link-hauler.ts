import * as Logger from 'utils/logger'
import {
    getCalculatedLinks,
    getStationaryPoints,
    getStationaryPointsBase,
    isStationaryBase,
} from 'construction-features'
import { getRenewInformation, moveToStationaryPoint } from 'utils/creep'
import { Position } from 'types'
import autoIncrement from 'utils/autoincrement'
import { fromBodyPlanSafe } from 'utils/parts'
import { getSpawns } from 'utils/room'
import { hasNoEnergy } from 'utils/energy-harvesting'
import { wrap } from 'utils/profiling'

const ROLE = 'static-link-hauler'

export interface StaticLinkHauler extends Creep {
    memory: StaticLinkHaulerMemory
}

interface StaticLinkHaulerMemory extends CreepMemory {
    role: 'static-link-hauler'
    pos: Position
    sourceId: Id<StructureLink>
    sinkId: Id<StructureStorage>
    lastWithdraw?: {
        time: number
        amount: number
        terminalDeposit?: { time: number; amount: number }
    }
}

class StaticLinkHaulerCreep {
    readonly creep: StaticLinkHauler

    constructor(creep: StaticLinkHauler) {
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

    get energy(): number {
        return this.creep.store.getUsedCapacity(RESOURCE_ENERGY)
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
        } else if (this.canAutoRenew()) {
            return this.autoRenew()
        }
        return this.transferEnergy()
    }

    isAtPosition(): boolean {
        return this.creep.pos.isEqualTo(this.pos)
    }

    moveToPosition(): void {
        const err = moveToStationaryPoint(this.pos, this.creep)
        if (err !== OK && err !== ERR_TIRED) {
            Logger.error(
                'static-link-hauler:moveToHarvestPos:failure',
                this.creep.name,
                this.creep.pos,
                this.pos,
                err,
            )
        }
    }

    getEnergy() {
        const source = Game.getObjectById<StructureLink>(this.creep.memory.sourceId)
        if (!source) {
            Logger.warning(
                'static-link-hauler:get-energy:link-not-found',
                this.creep.name,
                this.creep.memory.sourceId,
            )
            this.creep.suicide()
            return
        }
        const amountAvailable = Math.min(
            source.store.getUsedCapacity(RESOURCE_ENERGY),
            this.creep.store.getFreeCapacity(RESOURCE_ENERGY),
        )
        if (amountAvailable === 0) {
            return
        }
        const err = this.creep.withdraw(source, RESOURCE_ENERGY, amountAvailable)
        if (err !== OK) {
            Logger.warning('static-link-hauler:get-energy:failed', this.creep.name, err)
        } else {
            this.creep.memory.lastWithdraw = { time: Game.time, amount: amountAvailable }
        }
    }

    transferEnergy(): void {
        const sink = Game.getObjectById<StructureStorage>(this.creep.memory.sinkId)
        if (!sink) {
            Logger.warning(
                'static-link-hauler:transfer-energy:sink-not-found',
                this.creep.name,
                this.creep.memory.sinkId,
            )
            return
        }
        const err = this.creep.transfer(sink, RESOURCE_ENERGY)
        if (err !== OK) {
            Logger.warning('static-link-hauler:transfer-energy:failed', this.creep.name, err)
        }
    }

    canAutoRenew(): boolean {
        const { cost, ticks } = getRenewInformation(this.creep)
        const spawns = getSpawns(this.creep.room)
        return (
            this.creep.body.length === 10 &&
            spawns.length > 0 &&
            spawns[0].spawning === null &&
            cost <= this.energy &&
            CREEP_LIFE_TIME - (this.creep.ticksToLive ?? 0) > ticks
        )
    }

    autoRenew(): void {
        const spawns = getSpawns(this.creep.room)
        if (spawns.length === 0) {
            return
        }
        const err = spawns[0].renewCreep(this.creep)
        if (err !== OK) {
            Logger.info('static-link-hauler:auto-renew', this.creep.name, err)
        }
    }
}

const roleStaticLinkHauler = {
    run: wrap((creep: StaticLinkHauler) => {
        const runner = new StaticLinkHaulerCreep(creep)
        runner.run()
    }, 'runStaticLinkHauler'),

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
            Logger.error('static-link-hauler:create:failed', spawn.room.name, parts, capacity, pos)
            throw new Error(`failed to create static-link-hauler room ${roomName}`)
        }
        const err = spawn.spawnCreep(parts, `${ROLE}:${roomName}:${autoIncrement()}`, {
            memory,
        })
        return err
    },

    getMemory(room: Room): StaticLinkHaulerMemory | null {
        const points = getStationaryPoints(room)
        const links = getCalculatedLinks(room)
        if (!points || !links) {
            return null
        }
        const storage = room.storage
        const link = room
            .lookForAt(LOOK_STRUCTURES, links.storage.x, links.storage.y)
            .filter((structure) => structure.structureType === STRUCTURE_LINK)[0] as
            | StructureLink
            | undefined
        if (!storage || !link) {
            return null
        }
        if (!isStationaryBase(points)) {
            throw new Error('static-link-hauler:getMemory:invalid-points ' + room.name)
        }
        const pos = points.storageLink
        return {
            role: ROLE,
            home: room.name,
            pos,
            sourceId: link.id,
            sinkId: storage.id,
            tasks: [],
        } as StaticLinkHaulerMemory
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
    return fromBodyPlanSafe(capacity, [CARRY], { fixed: [MOVE], maxCopies: 9 })
}

export default roleStaticLinkHauler
