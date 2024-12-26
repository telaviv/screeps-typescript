import * as Logger from 'utils/logger'
import { followCreep, moveToRoom, moveWithinRoom } from 'utils/travel'
import { goHome, moveToStationaryPoint, recycle, wander } from 'utils/creep'
import { fromBodyPlan } from 'utils/parts'
import { getHostileConstructionSites } from 'utils/room'
import { wrap } from 'utils/profiling'

const ROLE = 'attack'

export interface Attacker extends Creep {
    memory: AttackerMemory
}

export interface AttackerMemory extends CreepMemory {
    role: 'attack'
    roomName: string
    home: string
    asPair?: true | Id<Creep>
    paired: boolean | undefined
}

function isCreep(target: Creep | Structure): target is Creep {
    return (target as Creep).hits !== undefined
}

export function isOwnedStructure(obj: Structure): obj is OwnedStructure {
    return 'owner' in obj
}

const sortHostiles =
    (pos: RoomPosition) =>
    (hostiles: Creep[]): Creep[] => {
        hostiles.sort((a, b) => {
            if (pos.isNearTo(a) && !pos.isNearTo(b)) {
                return -1
            } else if (!pos.isNearTo(a) && pos.isNearTo(b)) {
                return 1
            }
            if (a.getActiveBodyparts(ATTACK) > 0 && b.getActiveBodyparts(ATTACK) === 0) {
                return -1
            } else if (a.getActiveBodyparts(ATTACK) === 0 && b.getActiveBodyparts(ATTACK) > 0) {
                return 1
            }
            const claimDiff = b.getActiveBodyparts(CLAIM) - a.getActiveBodyparts(CLAIM)
            if (claimDiff !== 0) {
                return claimDiff
            }
            return pos.getRangeTo(a) - pos.getRangeTo(b)
        })
        return hostiles
    }

const roleAttacker = {
    run: wrap((creep: Attacker): void => {
        if (creep.spawning) {
            return
        }
        creep.notifyWhenAttacked(false)
        // creep.heal(creep)

        if (creep.memory.asPair === true) {
            wander(creep)
            return
        } else if (creep.memory.paired === false) {
            const partner = Game.getObjectById(creep.memory.asPair as Id<Creep>)
            if (partner && creep.pos.isNearTo(partner)) {
                creep.memory.paired = true
            } else {
                wander(creep)
                return
            }
        }
        const currentHostiles = sortHostiles(creep.pos)(creep.room.find(FIND_HOSTILE_CREEPS))
        if (creep.room.controller?.my && currentHostiles.length > 0) {
            roleAttacker.attack(creep, currentHostiles[0])
            return
        }

        const hostileNeighbor = roleAttacker.getHostileNeighbor(creep)
        if (hostileNeighbor) {
            roleAttacker.attack(creep, hostileNeighbor)
            return
        }

        if (!roleAttacker.isInRoom(creep)) {
            moveToRoom(creep, creep.memory.roomName, { avoidObstacleStructures: false })
            return
        }

        const targetRoom = Game.rooms[creep.memory.roomName]
        if (!targetRoom) {
            return
        }

        const hostiles = sortHostiles(creep.pos)(targetRoom.find(FIND_HOSTILE_CREEPS))
        const constructionSites = getHostileConstructionSites(targetRoom)

        const creepTargets: Creep[] = [...hostiles]
        creepTargets.sort((a, b) => {
            const distance = creep.pos.getRangeTo(a) - creep.pos.getRangeTo(b)
            if (distance !== 0) {
                return distance
            }
            return a.hits - b.hits
        })
        if (creepTargets.length > 0) {
            const creepTarget = creepTargets[0]
            roleAttacker.attack(creep, creepTarget)
            return
        }

        const structureTargets = targetRoom.find(FIND_HOSTILE_STRUCTURES)
        if (structureTargets.length > 0) {
            const structureTarget = structureTargets[0]
            roleAttacker.attack(creep, structureTarget)
            return
        }

        if (constructionSites.length > 0) {
            moveToStationaryPoint(constructionSites[0].pos, creep)
        } else {
            wander(creep)
        }
        creep.heal(creep)
    }, 'runAttacker'),

    getHostileNeighbor: (creep: Attacker): Creep | Structure | null => {
        if (!creep.room.controller?.my || creep.room.name !== creep.memory.roomName) {
            return null
        }
        const lookHostiles = creep.room.lookForAtArea(
            LOOK_CREEPS,
            Math.max(creep.pos.x - 1, 0),
            Math.max(creep.pos.y - 1, 0),
            Math.min(creep.pos.x + 1, 49),
            Math.min(creep.pos.y + 1, 49),
            true,
        )
        const hostiles = lookHostiles.map((c) => c.creep)
        const sorted = sortHostiles(creep.pos)(hostiles)
        if (sorted.length > 0) {
            return sorted[0]
        }
        const lookEnemyStructures = creep.room.lookForAtArea(
            LOOK_STRUCTURES,
            Math.max(creep.pos.x - 1, 0),
            Math.max(creep.pos.y - 1, 0),
            Math.min(creep.pos.x + 1, 49),
            Math.min(creep.pos.y + 1, 49),
            true,
        )
        const structures = lookEnemyStructures.map((c) => c.structure)
        const hostileBuildable = structures.filter((s) => isOwnedStructure(s) && !s.my)
        hostileBuildable.sort((a, b) => a.hits - b.hits)
        if (hostileBuildable.length > 0) {
            return hostileBuildable[0]
        }
        return null
    },

    isInRoom: (creep: Attacker): boolean => {
        return (
            creep.room.name === creep.memory.roomName &&
            creep.pos.x > 0 &&
            creep.pos.y > 0 &&
            creep.pos.x < 49 &&
            creep.pos.y < 49
        )
    },

    attack: (creep: Attacker, target: Creep | Structure): ScreepsReturnCode => {
        if (!creep.getActiveBodyparts(ATTACK)) {
            return ERR_NO_BODYPART
        }
        let err
        if (isCreep(target)) {
            followCreep(creep, target)
            err = creep.attack(target)
        } else {
            err = creep.attack(target)
            if (err === ERR_NOT_IN_RANGE) {
                moveWithinRoom(creep, { pos: target.pos, range: 1 })
            }
        }
        if (err !== OK && err !== ERR_NOT_IN_RANGE) {
            creep.heal(creep)
            Logger.warning('attacker:attack:failed', creep.name, target, err)
        }
        return err
    },

    cleanup(creep: Creep): void {
        if (creep.room.name === creep.memory.home) {
            recycle(creep)
            return
        }
        goHome(creep)
        Logger.info('attacker:no-targets', creep.name)
    },

    create(
        spawn: StructureSpawn,
        roomName: string,
        capacity: number | null = null,
        maxAttackParts: number | null = null,
        asPair = false,
    ): number {
        capacity = capacity ? capacity : spawn.room.energyCapacityAvailable
        const memory = {
            role: ROLE,
            home: spawn.room.name,
            roomName,
        } as AttackerMemory
        if (asPair) {
            memory.asPair = true
            memory.paired = false
        }
        return spawn.spawnCreep(calculateParts(capacity, maxAttackParts), `${ROLE}:${Game.time}`, {
            memory,
        })
    },
}

export function calculateParts(
    capacity: number,
    maxCopies: number | null = null,
): BodyPartConstant[] {
    maxCopies = maxCopies ? maxCopies : 50
    const fixed =
        capacity >= BODYPART_COST[HEAL] + BODYPART_COST[ATTACK] + BODYPART_COST[MOVE] * 2
            ? [HEAL, MOVE]
            : []
    const SORT_ORDER = [TOUGH, MOVE, ATTACK, HEAL]
    const parts = fromBodyPlan(capacity, [ATTACK, MOVE], {
        maxCopies,
        fixed,
        padding: [TOUGH, MOVE],
    })
    parts.sort(
        (a, b) =>
            SORT_ORDER.indexOf(a as TOUGH | MOVE | ATTACK | HEAL) -
            SORT_ORDER.indexOf(b as TOUGH | MOVE | ATTACK | HEAL),
    )
    return parts
}

export default roleAttacker
