import { getInjuredCreeps, getTowers } from 'utils/room'
import { HostileRecorder } from 'hostiles'
import { getCreeps } from 'utils/creep'
import roleAttacker from 'roles/attacker'
import roleHealer from 'roles/healer'

const FORCE_MULTIPLIER = 2
const TOWER_DANGER_OFFSET = 4

export default class DefenseDepartment {
    private readonly room: Room

    public constructor(room: Room) {
        this.room = room
    }

    public needsDefenders(): boolean {
        return (
            this.attackPartsNeeded() > 0 &&
            (this.room.controller?.safeMode === undefined || this.room.controller.safeMode <= 500)
        )
    }

    public currentAttackParts(): number {
        const attackers = getCreeps('attacker', this.room)
        return attackers.reduce((acc, creep) => acc + creep.getActiveBodyparts(ATTACK), 0)
    }

    public needsHealer(): boolean {
        const healers = getCreeps('healer', this.room)
        const injuredCreeps = getInjuredCreeps(this.room)
        return healers.length === 0 && injuredCreeps.length > 0
    }

    public hasInvaders(): boolean {
        const hostiles = this.room.find(FIND_HOSTILE_CREEPS)
        return hostiles.length > 0
    }

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

    private maxAttackPartsNeeded(): number {
        const danger = HostileRecorder.getDangerLevel(this.room.name)
        return danger * FORCE_MULTIPLIER
    }

    public createDefender(spawn: StructureSpawn, capacity: number): number {
        return roleAttacker.create(spawn, this.room.name, capacity, this.attackPartsNeeded())
    }

    public createHealer(spawn: StructureSpawn): number {
        return roleHealer.create(spawn, this.room.name)
    }

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
