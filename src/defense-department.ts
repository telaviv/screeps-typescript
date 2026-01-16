import { getInjuredCreeps, getTowers } from 'utils/room'
import { HostileRecorder } from 'hostiles'
import { getCreeps } from 'utils/creep'
import roleAttacker from 'roles/attacker'
import roleHealer from 'roles/healer'

/** Multiplier applied to hostile danger level when calculating defender needs */
const FORCE_MULTIPLIER = 2
/** Attack parts equivalence per tower for defense calculations */
const TOWER_DANGER_OFFSET = 4

/**
 * Manages defensive operations for a room.
 * Calculates defender needs and spawns attackers/healers in response to threats.
 */
export default class DefenseDepartment {
    private readonly room: Room

    /**
     * @param room - The room to manage defenses for
     */
    public constructor(room: Room) {
        this.room = room
    }

    /** Checks if the room needs defender creeps based on threat level and safe mode */
    public needsDefenders(): boolean {
        return (
            this.attackPartsNeeded() > 0 &&
            (this.room.controller?.safeMode === undefined || this.room.controller.safeMode <= 500)
        )
    }

    /** Returns the total ATTACK parts on current defender creeps */
    public currentAttackParts(): number {
        const attackers = getCreeps('attacker', this.room)
        return attackers.reduce((acc, creep) => acc + creep.getActiveBodyparts(ATTACK), 0)
    }

    /** Checks if the room needs a healer (no healers present and injured creeps exist) */
    public needsHealer(): boolean {
        const healers = getCreeps('healer', this.room)
        const injuredCreeps = getInjuredCreeps(this.room)
        return healers.length === 0 && injuredCreeps.length > 0
    }

    /** Checks if there are any hostile creeps in the room */
    public hasInvaders(): boolean {
        const hostiles = this.room.find(FIND_HOSTILE_CREEPS)
        return hostiles.length > 0
    }

    /** Calculates how many additional ATTACK parts are needed, accounting for towers */
    private attackPartsNeeded(): number {
        if (this.hasOverwhelmingForce()) {
            return 0
        }

        const maxAttackParts = this.maxAttackPartsNeeded()
        const currentAttackParts = this.currentAttackParts()
        const towers = getTowers(this.room)
        return Math.max(
            maxAttackParts - currentAttackParts - towers.length * TOWER_DANGER_OFFSET,
            0,
        )
    }

    /** Returns maximum attack parts needed based on danger level and force multiplier */
    private maxAttackPartsNeeded(): number {
        const danger = HostileRecorder.getDangerLevel(this.room.name)
        return danger * FORCE_MULTIPLIER
    }

    /**
     * Spawns a defender attacker creep.
     * @param spawn - The spawn to create from
     * @param capacity - Energy capacity available
     * @returns Spawn result code
     */
    public createDefender(spawn: StructureSpawn, capacity: number): number {
        return roleAttacker.create(spawn, this.room.name, capacity, this.attackPartsNeeded())
    }

    /**
     * Spawns a healer creep for the room.
     * @param spawn - The spawn to create from
     * @returns Spawn result code
     */
    public createHealer(spawn: StructureSpawn): number {
        return roleHealer.create(spawn, this.room.name)
    }

    /** Checks if hostile attack power exceeds defensible threshold (>10 parts) */
    public hasOverwhelmingForce(): boolean {
        if (!this.room.controller?.my && !this.room?.controller?.safeMode) {
            return false
        }
        const hostiles = this.room?.find(FIND_HOSTILE_CREEPS)
        if (!hostiles) {
            return false
        }
        const hostilePower = hostiles.reduce(
            (acc, c) => acc + c.getActiveBodyparts(ATTACK) + c.getActiveBodyparts(RANGED_ATTACK),
            0,
        )
        return hostilePower > 10
    }
}
