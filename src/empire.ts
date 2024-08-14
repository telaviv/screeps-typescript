import * as Logger from 'utils/logger'
import { ENEMY_DISTANCE_BUFFER, MAX_CLAIM_DISTANCE, MAX_SAVIOR_DISTANCE } from './constants'
import { RoomDistanceInfo, World } from 'utils/world'
import { RoomManager, RoomTask } from 'managers/room-manager'
import WarDepartment, { SpawnWarMemory, WarMemory, WarStatus } from 'war-department'
import { findClaimCapableRooms, findMyRooms, findSpawnRooms, hasNoSpawns } from 'utils/room'
import { HostileRecorder } from 'hostiles'
import { ScoutManager } from 'managers/scout-manager'
import { canBeClaimCandidate } from 'claim'
import { getConstructionFeaturesFromMemory } from 'construction-features'
import { profile } from 'utils/profiling'

const isSpawnWarMemory = (mem: WarMemory): mem is SpawnWarMemory => mem.status === WarStatus.SPAWN

declare global {
    interface Memory {
        autoclaim: boolean
    }
    namespace NodeJS {
        interface Global {
            findClaimCandidates: () => void
            nextScoutRoom: () => void
            enableAutoClaim: () => void
            disableAutoClaim: () => void
        }
    }
}

if (!Memory.autoclaim) Memory.autoclaim = true

function findClaimCandidates(): void {
    const empire = new Empire()
    const candidates = empire.findClaimCandidates()
    const match = empire.findBestClaimPair(candidates)
    if (!match) {
        console.log('no match')
        return
    }
    const { candidate, claimer, distance } = match
    console.log(`candidate: ${candidate} claimer: ${claimer} distance: ${distance}`)
}

function nextScoutRoom(): void {
    const scout = ScoutManager.create().findNextRoomToScout()
    if (scout) {
        console.log(`scout: ${scout}`)
    } else {
        console.log('no scout')
    }
}

function enableAutoClaim(): void {
    Memory.autoclaim = true
}

function disableAutoClaim(): void {
    Memory.autoclaim = false
}

global.findClaimCandidates = findClaimCandidates
global.nextScoutRoom = nextScoutRoom
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

    @profile
    autoClaim(): void {
        if (Game.gcl.level <= findMyRooms().length) return
        const scout = ScoutManager.create().findNextRoomToScout()
        if (scout) return
        const candidates = this.findClaimCandidates()
        if (candidates.length === 0) return

        const tasks = RoomManager.getAllClaimTasks()

        const match = this.findBestClaimPair(candidates)
        if (!match) {
            Logger.error(`empire:autoclaim: no claimer found for ${JSON.stringify(candidates)}`)
            return
        }
        const { candidate, claimer: claimerName } = match

        const claimer = Game.rooms[claimerName]
        if (!claimer) {
            Logger.warning(`empire:autoclaim: no vision for ${claimerName}`)
            return
        }
        if (tasks.some((task) => task.data.name === candidate)) return
        for (const r of this.rooms) {
            if (r.memory.war?.target === candidate) return
        }
        if ((claimer.memory.war?.status ?? WarStatus.NONE) !== WarStatus.NONE) return

        Logger.warning(`empire:autoclaim:addClaimRoomTask ${claimerName} for ${candidate}`)
        new RoomManager(claimer).addClaimRoomTask(candidate)
    }

    getRoomsBeingClaimed(): string[] {
        return this.rooms
            .map((room) => room.memory.war?.target)
            .filter((roomName) => roomName !== undefined)
    }

    @profile
    findClaimCandidates(): string[] {
        const world = new World()
        const roomNames = findClaimCapableRooms().map((room) => room.name)
        const closestRooms = world.getClosestRooms(roomNames, MAX_CLAIM_DISTANCE)
        if (closestRooms.length === 0) return []
        const candidates = closestRooms.filter(({ roomName }) => {
            if (!Memory.rooms[roomName]) return false
            if (Game.rooms[roomName]?.controller?.my) return false
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
        candidates.sort(({ distance: a }, { distance: b }) => a - b)
        return candidates.map(({ roomName }) => roomName)
    }

    findBestClaimPair(
        candidates: string[],
    ): { candidate: string; claimer: string; distance: number } | null {
        const world = new World()
        const claimers = findSpawnRooms()
            .filter((room) => room.energyCapacityAvailable >= 650)
            .map((room) => room.name)
        const pairs: { candidate: string; claimer: string; distance: number }[] = []
        for (const candidate of candidates) {
            const ri = world.getClosestRoom(candidate, claimers, MAX_CLAIM_DISTANCE)
            if (!ri) continue
            pairs.push({ candidate, claimer: ri.roomName, distance: ri.distance })
        }
        pairs.sort((a, b) => {
            const dangerA = HostileRecorder.getDangerLevel(a.candidate)
            const dangerB = HostileRecorder.getDangerLevel(b.candidate)
            if (dangerA !== dangerB) return dangerA - dangerB
            if (a.distance !== b.distance) return a.distance - b.distance
            return (
                Game.rooms[b.claimer].energyCapacityAvailable -
                Game.rooms[a.claimer].energyCapacityAvailable
            )
        })
        if (pairs.length === 0) return null
        return pairs[0]
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
