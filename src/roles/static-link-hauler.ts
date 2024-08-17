import * as Logger from 'utils/logger'
import { getCalculatedLinks, getStationaryPoints } from 'construction-features'
import { Position } from 'types'
import autoIncrement from 'utils/autoincrement'
import { fromBodyPlanSafe } from 'utils/parts'
import { hasNoEnergy } from 'utils/energy-harvesting'
import { moveToStationaryPoint } from 'utils/creep'
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
        if (source.store.getUsedCapacity(RESOURCE_ENERGY) === 0) {
            return
        }
        const err = this.creep.withdraw(source, RESOURCE_ENERGY)
        if (err !== OK) {
            Logger.warning('static-link-hauler:get-energy:failed', this.creep.name, err)
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
            Logger.error('claimer:create:failed', spawn.room.name, parts, capacity, pos)
            throw new Error(`failed to create claimer room ${roomName}`)
        }
        const err = spawn.spawnCreep(parts, `${ROLE}:${autoIncrement()}`, {
            memory,
        })
        if (err === ERR_NOT_ENOUGH_ENERGY) {
            throw new Error('not enough energy to make claimer')
        }
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
        const points = getStationaryPoints(room)
        if (points === null) {
            return null
        }
        return points.storageLink
    },
}

export function calculateParts(capacity: number): BodyPartConstant[] | null {
    return fromBodyPlanSafe(capacity, [MOVE], [CARRY], 9)
}

export default roleStaticLinkHauler
