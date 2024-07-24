import * as Logger from 'utils/logger'
import { ENEMY_DISTANCE_BUFFER, MAX_CLAIM_DISTANCE, MAX_SAVIOR_DISTANCE } from './constants'
import { RoomDistanceInfo, World } from 'utils/world'
import { RoomManager, RoomTask } from 'managers/room-manager'
import WarDepartment, { SpawnWarMemory, WarMemory, WarStatus } from 'war-department'
import { findMyRooms, findSpawnlessRooms, hasNoSpawns } from 'utils/room'
import { ScoutManager } from 'managers/scout-manager'
import { canBeClaimCandidate } from 'claim'
import { getConstructionFeaturesFromMemory } from 'surveyor'
import { profile } from 'utils/profiling'

const isSpawnWarMemory = (mem: WarMemory): mem is SpawnWarMemory => mem.status === WarStatus.SPAWN

declare global {
    interface Memory {
        autoclaim: boolean
    }
    namespace NodeJS {
        interface Global {
            findClaimCandidates: () => void
            enableAutoClaim: () => void
            disableAutoClaim: () => void
        }
    }
}

if (!Memory.autoclaim) Memory.autoclaim = false

function findClaimCandidates(): void {
    const empire = new Empire()
    const candidates = empire.findClaimCandidates()
    for (const room of candidates) {
        const claimer = empire.findBestClaimer(room)
        if (claimer) {
            console.log(`room: ${room} claimer: ${claimer}`)
        }
    }
}

function enableAutoClaim(): void {
    Memory.autoclaim = true
}

function disableAutoClaim(): void {
    Memory.autoclaim = false
}

global.findClaimCandidates = findClaimCandidates
global.enableAutoClaim = enableAutoClaim
global.disableAutoClaim = disableAutoClaim

function getBestNearbyRoom(
    roomName: string,
    distance: number,
    opts?: { filter: (info: RoomDistanceInfo) => boolean },
): Room | null {
    const world = new World()
    const closestRooms = world.getClosestRooms([roomName], distance)
    if (closestRooms.length === 0) return null
    let candidates = closestRooms.filter(
        ({ roomName: rn }) =>
            Game.rooms[rn]?.controller?.my &&
            !hasNoSpawns(Game.rooms[rn]) &&
            new WarDepartment(Game.rooms[rn]).status === WarStatus.NONE,
    )
    if (opts?.filter) {
        candidates = candidates.filter(opts.filter)
    }
    if (candidates.length === 0) return null
    candidates.sort(({ roomName: ar, distance: ad }, { roomName: br, distance: bd }) => {
        const roomA = Game.rooms[ar]
        const roomB = Game.rooms[br]
        if (ad !== bd) return ad - bd
        return (
            (roomB.controller?.progressTotal ?? Infinity) -
            (roomA.controller?.progressTotal ?? Infinity)
        )
    })
    return Game.rooms[candidates[0].roomName]
}

export default class Empire {
    private rooms: Room[]
    constructor() {
        this.rooms = findMyRooms()
    }

    @profile
    public run(): void {
        this.clearSaviors()
        this.findSaviors()

        if (Memory.autoclaim) {
            this.autoClaim()
        }

        for (const room of this.rooms) {
            const warDepartment = new WarDepartment(room)
            warDepartment.update()
        }
    }

    autoClaim(): void {
        const scout = ScoutManager.create().findNextRoomToScout()
        if (scout) return
        const candidates = this.findClaimCandidates()
        if (candidates.length === 0) return
        const roomName = candidates[0]
        Logger.info(`empire:autoclaim:candidates ${JSON.stringify(candidates)}`)

        if (findSpawnlessRooms().length > 0) {
            return
        }

        const tasks = RoomManager.getAllClaimTasks()
        if (tasks.some((task) => task.data.name === roomName)) return
        for (const r of this.rooms) {
            if (r.memory.war?.target === roomName) return
        }

        const claimerName = this.findBestClaimer(roomName)
        Logger.info(`empire:autoclaim:claimer ${claimerName} for ${roomName}`)
        if (!claimerName) {
            Logger.info(`empire:autoclaim: no claimer found for ${roomName}`)
            return
        }
        const claimer = Game.rooms[claimerName]
        if (!claimer) {
            Logger.warning(`empire:autoclaim: no vision for ${claimerName}`)
            return
        }
        if ((claimer.memory.war?.status ?? WarStatus.NONE) !== WarStatus.NONE) return

        new RoomManager(claimer).addClaimRoomTask(roomName)
    }

    getRoomsBeingClaimed(): string[] {
        return this.rooms
            .map((room) => room.memory.war?.target)
            .filter((roomName) => roomName !== undefined)
    }

    findClaimCandidates(): string[] {
        const world = new World()
        const roomNames = findMyRooms().map((room) => room.name)
        const closestRooms = world.getClosestRooms(roomNames, MAX_CLAIM_DISTANCE)
        if (closestRooms.length === 0) return []
        const candidates = closestRooms
            .filter(({ roomName }) => {
                const features = getConstructionFeaturesFromMemory(Memory.rooms[roomName])
                if (!features || !canBeClaimCandidate(Memory.rooms[roomName])) return false
                const neighbors = world.getClosestRooms([roomName], ENEMY_DISTANCE_BUFFER)
                // if any neighbor is owned by an enemy, don't claim
                return !neighbors.some(
                    ({ roomName: name }) =>
                        Memory.rooms[name]?.scout?.controllerOwner &&
                        Memory.rooms[name]?.scout?.controllerOwner !== global.USERNAME,
                )
            })
            .map((room) => room.roomName)
        candidates.sort(
            (a, b) =>
                (Memory.rooms[a].scout?.wallTerrain ?? Infinity) -
                (Memory.rooms[b].scout?.wallTerrain ?? Infinity),
        )
        return candidates
    }

    findBestClaimer(roomName: string): string | null {
        const maxDistance = MAX_CLAIM_DISTANCE
        const filterFn = ({ roomName: rn }: RoomDistanceInfo) =>
            Boolean(
                Game.rooms[rn]?.controller?.my && Game.rooms[rn]?.energyCapacityAvailable >= 650,
            ) // min claimer cost

        return getBestNearbyRoom(roomName, maxDistance, { filter: filterFn })?.name ?? null
    }

    private findSaviors(): void {
        for (const room of this.rooms) {
            const spawns = room.find(FIND_MY_SPAWNS)
            if (spawns.length > 0) {
                continue
            }
            if (Object.values(Memory.rooms).some((r) => r.war?.target === room.name)) {
                continue
            }
            const savior = getBestNearbyRoom(room.name, MAX_SAVIOR_DISTANCE)
            if (!savior) {
                Logger.warning(`empire:find-saviors:not-found: no savior found for ${room.name}`)
                continue
            }
            const warDepartment = new WarDepartment(savior)
            warDepartment.saveRoom(room.name)
        }
    }

    private clearSaviors(): void {
        for (const room of this.rooms) {
            const warDepartment = new WarDepartment(room)
            if (
                warDepartment.status === WarStatus.SPAWN &&
                isSpawnWarMemory(room.memory.war) &&
                room.memory.war.type === 'savior' &&
                ((warDepartment.targetRoom?.controller &&
                    !warDepartment.targetRoom?.controller.my) ||
                    warDepartment.hasHostiles())
            ) {
                warDepartment.cancelWar()
            }
        }
    }

    public getRoomTasks(): RoomTask[] {
        const tasks: RoomTask[] = []
        for (const room of this.rooms) {
            if (room.memory.tasks) {
                tasks.push(...room.memory.tasks)
            }
        }
        return tasks
    }
}
