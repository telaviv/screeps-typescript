import * as Logger from 'utils/logger'
import { getConstructionFeaturesV3 } from 'construction-features'
import { HostileRecorder } from 'hostiles'
import SourcesManager from './sources-manager'
import { ClaimerMemory } from 'roles/claim'
import { HealerMemory } from 'roles/healer'
import { RemoteHaulerMemory } from 'roles/remote-hauler'
import { getCreeps, getLogisticsCreeps } from 'utils/creep'
import { getNeighbors, getNonObstacleNeighbors } from 'utils/room-position'
import { findMyRooms, getHostileCreeps, getInjuredCreeps, getMyConstructionSites } from 'utils/room'
import { World } from 'utils/world'

/** Minimum reservation ticks before spawning more reservers */
const MIN_RESERVATION_TICKS = 3500
const MIN_BUILD_PARTS = 15
const MAX_BUILDER_COUNT = 4
/** Estimated round-trip time for haulers to remote mines */
const HAULER_ROUND_TRIP_TIME = 100

/** Remote mining room configuration stored in memory */
export interface Mine {
    name: string
    lastHaulerCreated?: number
    haulerCapacity?: number
    haulerCount?: number
    updatedAt?: number
}

declare global {
    interface Memory {
        miningEnabled: boolean
    }

    interface RoomMemory {
        mines?: Mine[]
    }

    namespace NodeJS {
        interface Global {
            mines: {
                assign: () => void
                clear: () => void
                enable: () => void
                disable: () => void
                status: () => void
                next: () => void
                canMine: (roomName: string) => boolean
            }
        }
    }
}

/**
 * Checks if a room can be mined.
 * @param roomName - The room to check
 * @param claimCandidates - Optional list of claim candidate rooms (to avoid mining them)
 * @returns True if the room can be used as a mine
 */
export function canMine(roomName: string, claimCandidates?: string[]): boolean {
    const features = getConstructionFeaturesV3(roomName)

    // Must have construction features calculated as 'mine' or 'base' type
    if (!features || (features.type !== 'mine' && features.type !== 'base')) {
        return false
    }

    const memory = Memory.rooms[roomName]
    if (!memory) {
        return false
    }

    const scout = memory.scout
    if (!scout) {
        return false
    }

    // Room must be unowned and not currently being mined by enemies
    if (scout.controllerOwner || scout.enemyThatsMining) {
        return false
    }

    // For 'base' type rooms, only allow mining if:
    // 1. We're at GCL cap (can't claim more rooms), OR
    // 2. Room is not a valid claim candidate
    if (features.type === 'base') {
        const myRoomsCount = findMyRooms().length

        // At GCL cap - can't claim anyway, so mining is fine
        if (myRoomsCount >= Game.gcl.level) {
            return true
        }

        // If claim candidates list provided, check if this room is in it
        // If it's a claim candidate, don't mine it (save it for claiming)
        if (claimCandidates && claimCandidates.includes(roomName)) {
            return false
        }
    }

    return true
}

/** Recalculates and assigns remote mines to their nearest owned room */
export function assignMines(claimCandidates?: string[]): void {
    clearMines()
    const mineDecider = new MineDecider(findMyRooms(), claimCandidates)
    mineDecider.assignMines()
}

function clearMines() {
    for (const mem of Object.values(Memory.rooms)) {
        delete mem.mines
    }
}

function enableMining() {
    Memory.miningEnabled = true
}

function disableMining() {
    Memory.miningEnabled = false
}

function showMiningStatus() {
    console.log('=== Mining Status ===')
    console.log(`Mining enabled: ${Memory.miningEnabled}`)
    console.log('')

    for (const room of findMyRooms()) {
        const mines = room.memory.mines
        if (!mines || mines.length === 0) {
            console.log(`${room.name}: No mines assigned`)
            continue
        }

        console.log(`${room.name}: ${mines.length} mine(s)`)
        for (const mine of mines) {
            const mm = new MineManager(mine.name, room)
            const needsAttention = mm.needsAttention()
            console.log(`  - ${mine.name}: ${needsAttention ? '⚠️ NEEDS ATTENTION' : '✅ OK'}`)

            if (mm.hasVision()) {
                console.log(
                    `    Vision: ✅, Sources: ${mm.sourceCount()}, Reserved: ${mm.controllerReserved()}`,
                )
                if (mm.controllerReserved()) {
                    console.log(`    Reservation: ${mm.controllerReservationTicksLeft()} ticks`)
                }
                console.log(
                    `    Harvesters: ${mm.hasEnoughHarvesters() ? '✅' : '❌'}, Haulers: ${
                        mm.hasEnoughHaulers() ? '✅' : '❌'
                    }`,
                )
            } else {
                console.log(`    Vision: ❌ (needs scout)`)
            }
        }
        console.log('')
    }
}

function showNextMine() {
    if (!Memory.miningEnabled) {
        console.log('Mining is disabled. Run global.mines.enable() first.')
        return
    }

    for (const room of findMyRooms()) {
        const mines = room.memory.mines
        if (!mines || mines.length === 0) {
            continue
        }

        for (const mine of mines) {
            const mm = new MineManager(mine.name, room)
            if (mm.needsAttention()) {
                console.log(`Next mine: ${mine.name} (owned by ${room.name})`)
                console.log(
                    `Needs: ${!mm.hasVision() ? 'Vision ' : ''}${
                        !mm.hasEnoughReservers() ? 'Reservers ' : ''
                    }${!mm.hasEnoughHarvesters() ? 'Harvesters ' : ''}${
                        !mm.hasEnoughHaulers() ? 'Haulers ' : ''
                    }${mm.needsProtection() ? 'Defenders ' : ''}`,
                )
                return
            }
        }
    }

    console.log('No mines need attention currently')
}

global.mines = {
    assign: assignMines,
    clear: clearMines,
    enable: enableMining,
    disable: disableMining,
    status: showMiningStatus,
    next: showNextMine,
    canMine,
}

/**
 * Manages a remote mining room.
 * Tracks harvester, hauler, and reserver needs for the mine.
 */
export class MineManager {
    private roomName: string
    /** The owned room responsible for this mine */
    private minee: Room
    private sourcesManager: SourcesManager | null

    get room(): Room {
        return Game.rooms[this.roomName]
    }

    get name(): string {
        return this.roomName
    }

    get controller(): StructureController | undefined {
        return this.room?.controller
    }

    constructor(roomName: string, minee: Room) {
        this.roomName = roomName
        this.minee = minee
        this.sourcesManager = Game.rooms[roomName] ? new SourcesManager(Game.rooms[roomName]) : null
    }

    /**
     * Checks if the owning room can effectively reserve this mine.
     * Requires enough energy capacity and accessible controller positions.
     */
    hasCapacityToReserve(): boolean {
        if (!this.room) {
            Logger.error('mine-manager:hasCapacityToReserve:no-room', this.roomName)
            return false
        }

        const unitCost = BODYPART_COST[CLAIM] + BODYPART_COST[MOVE]
        const mostClaims = Math.floor(this.minee.energyCapacityAvailable / unitCost)
        if (mostClaims === 0) {
            Logger.info(
                'mine-manager:hasCapacityToReserve:no-claims',
                this.minee.name,
                this.minee.energyCapacityAvailable,
                unitCost,
            )
            return false
        }
        const scout = Memory.rooms[this.roomName].scout
        if (!scout || !scout.controllerPosition) {
            Logger.error(
                'mine-manager:hasCapacityToReserve:no-scout-or-controller-position',
                this.roomName,
            )
            return false
        }
        const controllerPos = new RoomPosition(
            scout.controllerPosition.x,
            scout.controllerPosition.y,
            this.roomName,
        )
        const neighbors = getNeighbors(controllerPos)
        const terrain = new Room.Terrain(this.roomName)
        const totalSpots = neighbors.filter(
            (pos) => terrain.get(pos.x, pos.y) !== TERRAIN_MASK_WALL,
        ).length
        Logger.error(
            'mine-manager:hasCapacityToReserve',
            this.roomName,
            mostClaims,
            totalSpots,
            mostClaims * totalSpots >= 3,
        )
        return mostClaims * totalSpots >= 3
    }

    hasVision(): boolean {
        return !!this.room
    }

    controllerReserved(): boolean {
        return !!this.room.controller?.reservation
    }

    /** Comprehensive check if the mine needs any creep spawning */
    needsAttention(): boolean {
        return (
            !this.hasVision() ||
            (this.hasCapacityToReserve() &&
                (!this.controllerReserved() ||
                    (this.controllerReservationTicksLeft() < MIN_RESERVATION_TICKS &&
                        !this.hasEnoughReservers()))) ||
            (this.needsProtection() && !this.hasDefenders()) ||
            !this.hasEnoughConstructionParts() ||
            !this.hasEnoughHarvesters() ||
            !this.hasEnoughHaulers()
        )
    }

    hasEnoughReservers(): boolean {
        const claimCount = this.getClaimPartCount()
        const claimPartsNeeded = this.getClaimPartsNeeded()
        return claimCount >= claimPartsNeeded
    }

    hasEnoughHarvesters(): boolean {
        if (!this.sourcesManager) {
            return true
        }
        return this.sourcesManager.hasAllContainerHarvesters()
    }

    hasAnyHarvester(): boolean {
        if (!this.sourcesManager) {
            return false
        }
        return this.sourcesManager.hasAHarvester()
    }

    needsHealer(): boolean {
        if (!this.room) {
            return false
        }
        const injured = getInjuredCreeps(this.room)
        const healers = getCreeps('healer').filter(
            (creep: Creep) => (creep.memory as HealerMemory).roomName === this.roomName,
        )
        return healers.length === 0 && injured.length > 0
    }

    getClaimPartCount(): number {
        const claimers = this.getClaimers()
        return claimers.reduce(
            (acc: number, creep: Creep) => acc + creep.getActiveBodyparts(CLAIM),
            0,
        )
    }

    getClaimPartsNeeded(): number {
        const ticksToEnd = this.controllerReservationTicksLeft()
        if (ticksToEnd < MIN_RESERVATION_TICKS) {
            return 3
        }
        return 0
    }

    getClaimers(): Creep[] {
        const mineeClaimers = getCreeps('claimer', this.minee).filter(
            (creep: Creep) => (creep.memory as ClaimerMemory).roomName === this.roomName,
        )
        if (!this.room) {
            return mineeClaimers
        }
        const minerClaimers = getCreeps('claimer', this.room).filter(
            (creep: Creep) => (creep.memory as ClaimerMemory).roomName === this.roomName,
        )
        return minerClaimers
    }

    hasDefenders(): boolean {
        return this.getDefenders().length > 0
    }

    getDefenders(): Creep[] {
        const mineeClaimers = getCreeps('attack', this.minee).filter(
            (creep: Creep) => (creep.memory as ClaimerMemory).roomName === this.roomName,
        )
        if (!this.room) {
            return mineeClaimers
        }
        const minerClaimers = getCreeps('attack', this.room).filter(
            (creep: Creep) => (creep.memory as ClaimerMemory).roomName === this.roomName,
        )
        return minerClaimers
    }

    public needsProtection(): boolean {
        if (!this.room) {
            return false
        }
        const hostileRecorder = new HostileRecorder(this.room.name)
        const dangerLevel = hostileRecorder.dangerLevel()
        if ((dangerLevel > 0 && dangerLevel < 10) || this.hasHostiles()) {
            return true
        }
        return false
    }

    public needsRepairs(): boolean {
        if (!this.room) {
            return false
        }
        const structures = this.room
            .find(FIND_STRUCTURES)
            .find((structure) => structure.hits / structure.hitsMax < 0.5)
        return !!structures
    }

    private hasHostiles(): boolean {
        return this.room && (this.hasInvaderCore() || getHostileCreeps(this.room).length > 0)
    }

    public hasEnoughConstructionParts(): boolean {
        if (!this.room) {
            return true
        }

        if (this.constructionFinished()) {
            return true
        }
        const builders = this.getWorkers()
        if (builders.length >= MAX_BUILDER_COUNT) {
            return true
        }
        const constructionParts = builders.reduce(
            (acc: number, creep: Creep) => acc + creep.getActiveBodyparts(WORK),
            0,
        )
        return constructionParts >= MIN_BUILD_PARTS
    }

    public getWorkers(): Creep[] {
        return getLogisticsCreeps({ room: this.room })
    }

    public getHaulers(): Creep[] {
        return getCreeps('remote-hauler').filter(
            (creep: Creep) => (creep.memory as RemoteHaulerMemory).remote === this.roomName,
        )
    }

    /**
     * Checks if hauler capacity matches energy production.
     * Reserved rooms produce 10 energy/tick, unreserved produce 5.
     */
    public hasEnoughHaulers(): boolean {
        if (!this.constructionFinished()) {
            return true
        }

        const energyProducedPerRoundTrip =
            this.sourceCount() * (this.hasCapacityToReserve() ? 10 : 5) * HAULER_ROUND_TRIP_TIME
        let haulerCapacity = 0
        for (const hauler of this.getHaulers()) {
            haulerCapacity += hauler.getActiveBodyparts(CARRY) * CARRY_CAPACITY
        }

        return haulerCapacity >= energyProducedPerRoundTrip
    }

    hasClaimSpotAvailable(): boolean {
        if (!this.room?.controller) {
            return false
        }
        if (!this.hasCapacityToReserve()) {
            return false
        }
        const totalSpots = getNonObstacleNeighbors(this.room?.controller.pos).length
        const claimerCount = this.getClaimers().length
        return totalSpots > claimerCount
    }

    controllerReservationTicksLeft(): number {
        return this.room?.controller?.reservation?.ticksToEnd ?? 0
    }

    sourceCount(): number {
        return this.room.find(FIND_SOURCES).length
    }

    constructionFinished(): boolean {
        const room = this.room
        if (!room || (this.hasCapacityToReserve() && !this.controllerReserved())) {
            return false
        }
        const sites = getMyConstructionSites(room)
        return sites.length === 0
    }

    public hasInvaderCore(): boolean {
        const invaderCores = this.room?.find(FIND_STRUCTURES, {
            filter: { structureType: STRUCTURE_INVADER_CORE },
        })
        return invaderCores ? invaderCores.length > 0 : false
    }
}

/**
 * Determines which owned room should manage each remote mine.
 * Assigns mines to adjacent owned rooms, preferring higher-level rooms.
 */
export class MineDecider {
    private myRooms: Room[]
    private claimCandidates?: string[]

    constructor(myRooms: Room[], claimCandidates?: string[]) {
        this.myRooms = myRooms
        this.claimCandidates = claimCandidates
    }

    static create(): MineDecider {
        return new MineDecider(findMyRooms())
    }

    /** Assigns each mine to its best adjacent owned room */
    assignMines(): void {
        const mines = this.getMines()
        for (const mine of mines) {
            Logger.info('mine-decider:assignMines', mine)
            this.addMineToMiner(mine)
        }
        for (const room of this.myRooms) {
            if (!room.memory.mines) {
                continue
            }
            room.memory.mines.sort((a, b) => {
                const sourcesA = Memory.rooms[a.name].scout?.sourceCount ?? 0
                const sourcesB = Memory.rooms[b.name].scout?.sourceCount ?? 0
                return sourcesB - sourcesA
            })
        }
    }

    /** Gets all valid mine rooms (adjacent, unowned, not enemy-mined) */
    private getMines(): string[] {
        const world = new World()
        const closest = world
            .getClosestRooms(
                this.myRooms.map((r) => r.name),
                1,
            )
            .map((r) => r.roomName)
        return closest.filter((name) => canMine(name, this.claimCandidates))
    }

    private addMineToMiner(mine: string): void {
        const exits = Game.map.describeExits(mine)
        const miners = []
        for (const room of Object.values(exits)) {
            if (!Game.rooms[room] || !Game.rooms[room].controller?.my) {
                continue
            }
            miners.push(room)
        }
        miners.sort(
            (a, b) =>
                (Game.rooms[b]?.controller?.progressTotal ?? 0) -
                (Game.rooms[a]?.controller?.progressTotal ?? 0),
        )
        const miner = miners[0]
        if (!Memory.rooms[miner].mines) {
            Memory.rooms[miner].mines = []
        }
        Logger.info('mine-decider:addMineToMiner', miner, mine)
        const mines = Memory.rooms[miner].mines as Mine[]
        mines.push({ name: mine })
    }
}
