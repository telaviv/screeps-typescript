import { getCreeps } from 'utils/creep'
import { getInjuredCreeps } from 'utils/room'
import roleAttacker from 'roles/attacker'
import roleHealer from 'roles/healer'

const FORCE_MULTIPLIER = 2

export default class DefenseDepartment {
    private readonly room: Room

    public constructor(room: Room) {
        this.room = room
    }

    public needsDefenders(): boolean {
        return this.maxAttackPartsNeeded() > 0
    }

    public needsHealer(): boolean {
        const healers = getCreeps('healer', this.room)
        return healers.length === 0 && getInjuredCreeps(this.room).length > 0
    }

    public hasInvaders(): boolean {
        const hostiles = this.room.find(FIND_HOSTILE_CREEPS)
        return hostiles.length > 0
    }

    private maxAttackPartsNeeded(): number {
        const hostiles = this.room.find(FIND_HOSTILE_CREEPS)
        const hostileAttacks = hostiles.reduce(
            (total, hostile) =>
                total +
                hostile.getActiveBodyparts(ATTACK) +
                hostile.getActiveBodyparts(RANGED_ATTACK),
            0,
        )
        const friendlies = this.room.find(FIND_MY_CREEPS)
        const friendlyAttacks = friendlies.reduce(
            (total, hostile) =>
                total +
                hostile.getActiveBodyparts(ATTACK) +
                hostile.getActiveBodyparts(RANGED_ATTACK),
            0,
        )
        return (hostileAttacks - friendlyAttacks) * FORCE_MULTIPLIER
    }

    public createDefender(spawn: StructureSpawn, capacity: number): number {
        const maxAttackParts = this.maxAttackPartsNeeded()
        return roleAttacker.create(spawn, this.room.name, capacity, maxAttackParts)
    }

    public createHealer(spawn: StructureSpawn): number {
        return roleHealer.create(spawn, this.room.name)
    }
}
