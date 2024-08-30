import * as Logger from 'utils/logger'
import { findMyRooms, getHostileCreeps, getInjuredCreeps, getMyConstructionSites } from 'utils/room'
import { getCreeps, getLogisticsCreeps } from 'utils/creep'
import { getNeighbors, getNonObstacleNeighbors } from 'utils/room-position'
import roleRemoteHauler, { RemoteHaulerMemory } from 'roles/remote-hauler'
import { ClaimerMemory } from 'roles/claim'
import { HealerMemory } from 'roles/healer'
import { HostileRecorder } from 'hostiles'
import SourcesManager from './sources-manager'
import { World } from 'utils/world'
import { getConstructionFeaturesV3 } from 'construction-features'
import { getSlidingEnergy } from 'room-window'

const MIN_RESERVATION_TICKS = 3500
const MIN_BUILD_PARTS = 15
const HAULER_COUNT_RECHECK = 500 // ticks
const MIN_ENERGY_PERCENT = 0.2
const MAX_ENERGY_PERCENT = 0.8

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
                purge: () => void // purge caches
            }
        }
    }
}

function assignMines() {
    clearMines()
    const mineDecider = new MineDecider(findMyRooms())
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

function purgeCaches() {
    for (const room of findMyRooms()) {
        for (const mine of room.memory.mines ?? []) {
            const haulers = new MineHaulers(mine.name, room)
            haulers.purge()
        }
    }
}

global.mines = {
    assign: assignMines,
    clear: clearMines,
    enable: enableMining,
    disable: disableMining,
    purge: purgeCaches,
}

export class MineManager {
    private roomName: string
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

    hasCapacityToMine(): boolean {
        const unitCost = BODYPART_COST[CLAIM] + BODYPART_COST[MOVE]
        const mostClaims = Math.floor(this.minee.energyCapacityAvailable / unitCost)
        const scout = Memory.rooms[this.roomName].scout
        if (!scout || !scout.controllerPosition) {
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
        return mostClaims * totalSpots >= 3
    }

    hasVision(): boolean {
        return !!this.room
    }

    controllerReserved(): boolean {
        return !!this.room.controller?.reservation
    }

    needsAttention(): boolean {
        return (
            this.hasCapacityToMine() &&
            (!this.hasVision() ||
                !this.controllerReserved() ||
                (this.controllerReservationTicksLeft() < MIN_RESERVATION_TICKS &&
                    !this.hasEnoughReservers()) ||
                (this.needsProtection() && !this.hasDefenders()) ||
                !this.hasEnoughConstructionParts() ||
                !this.hasEnoughHarvesters() ||
                !this.hasEnoughHaulers())
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
        const mineeClaimers = getCreeps('attacker', this.minee).filter(
            (creep: Creep) => (creep.memory as ClaimerMemory).roomName === this.roomName,
        )
        if (!this.room) {
            return mineeClaimers
        }
        const minerClaimers = getCreeps('attacker', this.room).filter(
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

    public hasEnoughHaulers(): boolean {
        if (!this.constructionFinished()) {
            return true
        }
        return this.getHaulers().length > 0
    }

    hasClaimSpotAvailable(): boolean {
        if (!this.room?.controller) {
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
        if (!room || !this.controllerReserved()) {
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

export class MineDecider {
    private myRooms: Room[]
    constructor(myRooms: Room[]) {
        this.myRooms = myRooms
    }

    static create(): MineDecider {
        return new MineDecider(findMyRooms())
    }

    assignMines(): void {
        const mines = this.getMines()
        for (const mine of mines) {
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

    private getMines(): string[] {
        const world = new World()
        const closest = world
            .getClosestRooms(
                this.myRooms.map((r) => r.name),
                1,
            )
            .map((r) => r.roomName)
        return closest.filter((name) => {
            const features = getConstructionFeaturesV3(name)
            if (!features || features.type !== 'mine') {
                return false
            }
            const memory = Memory.rooms[name]
            if (!memory) {
                return false
            }
            const scout = memory.scout
            if (!scout) {
                return false
            }
            return !scout.controllerOwner && !scout.enemyThatsMining
        })
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
        const mines = Memory.rooms[miner].mines as Mine[]
        mines.push({ name: mine })
    }
}

export class MineHaulers {
    private mineName: string
    private minee: Room

    constructor(mineName: string, minee: Room) {
        this.mineName = mineName
        this.minee = minee
        this.mine.haulerCount = this.mine.haulerCount ?? 1
        this.mine.haulerCapacity = this.mine.haulerCapacity ?? 0
        this.mine.updatedAt = this.mine.updatedAt ?? 0
    }

    get mine(): Mine {
        const mine = this.minee.memory.mines?.find((m) => m.name === this.mineName)
        if (!mine) {
            throw new Error(
                `MineHaulers: mine not found ${this.mineName} ${JSON.stringify(
                    this.minee.memory.mines,
                )}`,
            )
        }
        return mine
    }

    private getEnergy(): number {
        const scout = Memory.rooms[this.mine.name].scout
        if (!scout) {
            return 0
        }
        const sourceCount = scout.sourceCount
        const energy99 = getSlidingEnergy(this.mine.name, 99, sourceCount)
        const energy999 = getSlidingEnergy(this.mine.name, 999, sourceCount)
        return (energy99 + energy999) / 2
    }

    public haulerCount(): number {
        return this.mine.haulerCount ?? 1
    }

    public createHauler(spawn: StructureSpawn, capacity: number): void {
        const err = roleRemoteHauler.create(spawn, { remote: this.mine.name, capacity })
        if (err === OK) {
            if (capacity !== this.mine.haulerCapacity) {
                this.mine.haulerCount = 1
            }
            this.mine.lastHaulerCreated = Game.time
            this.mine.haulerCapacity = capacity
        }
    }

    public updateHaulerCount(): void {
        if (this.mine.lastHaulerCreated === undefined) {
            return
        }
        const isTimeToRecheck = Game.time - this.mine.lastHaulerCreated > HAULER_COUNT_RECHECK
        const hasRechecked = Game.time + this.mine.lastHaulerCreated < (this.mine.updatedAt ?? 0)
        console.log(
            'updateHaulerCount',
            isTimeToRecheck,
            !hasRechecked,
            this.mine.lastHaulerCreated,
            this.mine.updatedAt,
            Game.time,
        )
        if (isTimeToRecheck && !hasRechecked) {
            const energy = this.getEnergy()
            const oldCapacity = this.mine.haulerCapacity
            if (energy > MAX_ENERGY_PERCENT) {
                this.mine.haulerCapacity = (this.mine.haulerCapacity ?? 1) + 1
                this.mine.updatedAt = Game.time
                Logger.error(
                    'mine-haulers:updateHaulerCount:over',
                    this.mine.name,
                    oldCapacity,
                    this.mine.haulerCapacity,
                )
            } else if (energy < MIN_ENERGY_PERCENT) {
                this.mine.haulerCapacity = Math.min((this.mine.haulerCapacity ?? 1) - 1, 1)
                this.mine.updatedAt = Game.time
                Logger.error(
                    'mine-haulers:updateHaulerCount:under',
                    this.mine.name,
                    oldCapacity,
                    this.mine.haulerCapacity,
                )
            }
        }
    }

    public purge(): void {
        for (const room of this.minee.memory.mines ?? []) {
            delete room.lastHaulerCreated
            delete room.haulerCapacity
            delete room.haulerCount
            delete room.updatedAt
        }
    }
}
