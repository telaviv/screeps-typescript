import { getInjuredCreeps, getTowers } from 'utils/room'
import { HostileRecorder } from 'hostiles'
import { getCreeps } from 'utils/creep'
import roleAttacker, { calculateParts as calculateAttackerParts } from 'roles/attacker'
import roleHealer from 'roles/healer'

/** Multiplier applied to hostile danger level when calculating defender needs */
const FORCE_MULTIPLIER = 2
/** Attack parts equivalence per tower for defense calculations */
const TOWER_DANGER_OFFSET = 4
/** Number of attackers we can effectively support in defense */
const SUPPORTED_ATTACKERS = 2

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
        if (this.hasOverwhelmingHealing()) {
            return 0
        }

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

    /**
     * Calculates total healing power of hostile creeps, accounting for boosts.
     * Only counts creeps that have RANGED_ATTACK (the threatening combination).
     * @returns Total healing power per tick
     */
    private calculateHostileHealingPower(): number {
        const hostiles = this.room.find(FIND_HOSTILE_CREEPS)
        if (!hostiles || hostiles.length === 0) {
            return 0
        }

        let totalHealPower = 0

        for (const hostile of hostiles) {
            // Only count healing from creeps with ranged attack capability
            const hasRangedAttack = hostile.getActiveBodyparts(RANGED_ATTACK) > 0
            if (!hasRangedAttack) {
                continue
            }

            // Calculate healing power from each HEAL body part
            for (const part of hostile.body) {
                if (part.type === HEAL && part.hits > 0) {
                    let healPower = HEAL_POWER
                    // Check for boost multiplier using Screeps built-in BOOSTS constant
                    if (part.boost && BOOSTS[HEAL][part.boost]) {
                        const boostEffect = BOOSTS[HEAL][part.boost]
                        // BOOSTS.heal contains { heal: multiplier } where multiplier is the boost amount
                        healPower *= boostEffect.heal
                    }
                    totalHealPower += healPower
                }
            }
        }

        return totalHealPower
    }

    /**
     * Checks if hostile creeps have overwhelming healing power compared to our attack capability.
     * Returns true when enemy healing exceeds the damage output of 2 attackers we can support.
     */
    public hasOverwhelmingHealing(): boolean {
        if (!this.room.controller?.my) {
            return false
        }

        const hostileHealPower = this.calculateHostileHealingPower()
        if (hostileHealPower === 0) {
            return false
        }

        // Calculate our potential attack power with 2 supported attackers
        // Use actual attacker body part calculation for the room's energy capacity
        const capacity = this.room.energyCapacityAvailable
        const attackerBody = calculateAttackerParts(capacity)
        const attackPartsPerCreep = attackerBody.filter((part) => part === ATTACK).length
        const ourAttackPower = SUPPORTED_ATTACKERS * attackPartsPerCreep * ATTACK_POWER

        return hostileHealPower > ourAttackPower
    }
}
