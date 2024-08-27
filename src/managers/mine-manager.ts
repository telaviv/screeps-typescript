import { findMyRooms, getHostileCreeps, getMyConstructionSites } from 'utils/room'
import { getCreeps, getLogisticsCreeps } from 'utils/creep'
import { ClaimerMemory } from 'roles/claim'
import { HostileRecorder } from 'hostiles'
import { World } from 'utils/world'
import { getConstructionFeaturesV3 } from 'construction-features'
import { getNonObstacleNeighbors } from 'utils/room-position'

const MIN_RESERVATION_TICKS = 2500

export interface Mine {
    name: string
}

declare global {
    interface RoomMemory {
        mines?: Mine[]
    }

    namespace NodeJS {
        interface Global {
            mines: { assign: () => void; clear: () => void }
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

global.mines = {
    assign: assignMines,
    clear: clearMines,
}

export class MineManager {
    private roomName: string
    private minee: Room

    get room(): Room {
        return Game.rooms[this.roomName]
    }

    get name(): string {
        return this.roomName
    }

    constructor(roomName: string, minee: Room) {
        this.roomName = roomName
        this.minee = minee
    }

    hasVision(): boolean {
        return !!this.room
    }

    controllerReserved(): boolean {
        return !!this.room.controller?.reservation
    }

    needsAttention(): boolean {
        return (
            !this.hasVision() ||
            !this.controllerReserved() ||
            (this.controllerReservationTicksLeft() < MIN_RESERVATION_TICKS &&
                !this.hasEnoughReservers())
        )
    }

    hasEnoughReservers(): boolean {
        const claimCount = this.getClaimPartCount()
        const claimPartsNeeded = this.getClaimPartsNeeded()
        console.log('hasEnoughReservers', this.roomName, claimCount, claimPartsNeeded)
        return claimCount >= claimPartsNeeded
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
        if (ticksToEnd < 3000) {
            return 3
        } else if (ticksToEnd < 4500) {
            return 2
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
        return [...mineeClaimers, ...minerClaimers]
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
        return [...mineeClaimers, ...minerClaimers]
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

    private hasHostiles(): boolean {
        return this.room && (this.hasInvaderCore() || getHostileCreeps(this.room).length > 0)
    }

    public hasEnoughConstructionParts(count: number): boolean {
        if (this.constructionFinished()) {
            return true
        }
        const builders = getLogisticsCreeps({ room: this.room })
        const constructionParts = builders.reduce(
            (acc: number, creep: Creep) => acc + creep.getActiveBodyparts(WORK),
            0,
        )
        return constructionParts >= count
    }

    hasClaimSpotAvailable(): boolean {
        if (!this.room.controller) {
            return false
        }
        const totalSpots = getNonObstacleNeighbors(this.room?.controller.pos).length
        const claimerCount = this.getClaimers().length
        console.log('hasClaimSpotAvailable', this.roomName, claimerCount, totalSpots)
        return totalSpots > claimerCount
    }

    controllerReservationTicksLeft(): number {
        return this.room.controller?.reservation?.ticksToEnd ?? 0
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
