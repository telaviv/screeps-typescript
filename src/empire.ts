import * as Logger from 'utils/logger'
import { ENEMY_DISTANCE_BUFFER, MAX_CLAIM_DISTANCE, MAX_SAVIOR_DISTANCE } from './constants'
import { RoomDistanceInfo, World } from 'utils/world'
import { RoomManager, RoomTask } from 'managers/room-manager'
import WarDepartment, { SpawnWarMemory, WarMemory, WarStatus } from 'war-department'
import { findClaimCapableRooms, findMyRooms, findSpawnRooms, hasNoSpawns } from 'utils/room'
import { HostileRecorder } from 'hostiles'
import { ScoutManager } from 'managers/scout-manager'
import { assignMines } from 'managers/mine-manager'
import { canBeClaimCandidate } from 'claim'
import { getConstructionFeaturesV3 } from 'construction-features'
import { profile } from 'utils/profiling'

/**
 * Type guard to check if war memory indicates spawn phase.
 * @param mem - The war memory to check
 * @returns True if the war status is SPAWN
 */
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

if (Memory.autoclaim === undefined) Memory.autoclaim = false

/**
 * Console command to find and display the best room claim candidate.
 * Searches for claimable rooms and outputs the best match with distance info.
 */
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

/**
 * Console command to display the next room to scout.
 */
function nextScoutRoom(): void {
    const scout = ScoutManager.create().findNextRoomToScout()
    if (scout) {
        console.log(`scout: ${scout}`)
    } else {
        console.log('no scout')
    }
}

/**
 * Console command to enable automatic room claiming.
 */
function enableAutoClaim(): void {
    Memory.autoclaim = true
}

/**
 * Console command to disable automatic room claiming.
 */
function disableAutoClaim(): void {
    Memory.autoclaim = false
}

global.findClaimCandidates = findClaimCandidates
global.nextScoutRoom = nextScoutRoom
global.enableAutoClaim = enableAutoClaim
global.disableAutoClaim = disableAutoClaim

/**
 * Finds the best nearby owned room that can assist with operations.
 * Prioritizes by distance, then by controller progress.
 * @param roomName - The target room to find assistance for
 * @param distance - Maximum search distance
 * @param opts - Optional filter function for candidate rooms
 * @returns The best candidate room or null if none found
 */
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

/**
 * Manages empire-wide operations across all owned rooms.
 * Handles auto-claiming, savior assignments, and war coordination.
 */
export default class Empire {
    /** All rooms owned by the player */
    private rooms: Room[]

    constructor() {
        this.rooms = findMyRooms()
    }

    /**
     * Executes per-tick empire management.
     * Manages savior assignments, auto-claiming, and war department updates.
     */
    @profile
    public run(): void {
        this.clearSaviors()
        this.findSaviors()

        if (Memory.autoclaim) {
            this.autoClaim()
        }

        // Track war statuses before update to detect claim completion
        const previousWarStatuses = new Map<string, WarStatus>()
        for (const room of this.rooms) {
            const warDepartment = new WarDepartment(room)
            previousWarStatuses.set(room.name, warDepartment.status)
        }

        // Update war departments
        for (const room of this.rooms) {
            const warDepartment = new WarDepartment(room)
            warDepartment.update()
        }

        // Check if any room transitioned from CLAIM to SPAWN (successful claim)
        for (const room of this.rooms) {
            const previousStatus = previousWarStatuses.get(room.name)
            const warDepartment = new WarDepartment(room)
            const currentStatus = warDepartment.status

            if (previousStatus === WarStatus.CLAIM && currentStatus === WarStatus.SPAWN) {
                Logger.warning(
                    'empire:run: Room claimed successfully, auto-assigning mines',
                    warDepartment.target,
                )
                assignMines()
                break // Only need to assign once
            }
        }
    }

    /**
     * Automatically claims new rooms when GCL allows.
     * Waits for scouting to complete before selecting candidates.
     */
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

    /**
     * Gets the list of rooms currently being claimed.
     * @returns Array of room names that are active claim targets
     */
    getRoomsBeingClaimed(): string[] {
        return this.rooms
            .map((room) => room.memory.war?.target)
            .filter((roomName) => roomName !== undefined)
    }

    /**
     * Finds rooms that are valid candidates for claiming.
     * Filters by distance, construction features, and enemy proximity.
     * @returns Array of room names sorted by distance
     */
    @profile
    findClaimCandidates(): string[] {
        const world = new World()
        const roomNames = findClaimCapableRooms().map((room) => room.name)
        const closestRooms = world.getClosestRooms(roomNames, MAX_CLAIM_DISTANCE)
        if (closestRooms.length === 0) return []
        const candidates = closestRooms.filter(({ roomName }) => {
            if (!Memory.rooms[roomName]) return false
            if (Game.rooms[roomName]?.controller?.my) return false
            const constructionFeaturesV3 = getConstructionFeaturesV3(roomName)
            if (!constructionFeaturesV3 || constructionFeaturesV3.type !== 'base') return false
            const { features } = constructionFeaturesV3
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

    /**
     * Finds the optimal pairing of a claim candidate with a claimer room.
     * Sorts by danger level, then distance, then claimer energy capacity.
     * @param candidates - Array of potential rooms to claim
     * @returns The best candidate-claimer pair or null if none found
     */
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

    /**
     * Assigns savior rooms to owned rooms that have lost their spawns.
     * Finds nearby rooms to send assistance for reconstruction.
     */
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
                Logger.info(`empire:find-saviors:not-found: no savior found for ${room.name}`)
                continue
            }
            const warDepartment = new WarDepartment(savior)
            warDepartment.saveRoom(room.name)
        }
    }

    /**
     * Cancels savior operations for rooms that are no longer owned or have hostiles.
     */
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

    /**
     * Collects all room tasks from the empire.
     * @returns Array of all tasks across all owned rooms
     */
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
