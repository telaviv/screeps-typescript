import { World } from 'utils/world'
import { findMyRooms } from 'utils/room'
import { getConstructionFeaturesV3FromMemory } from 'construction-features'

interface Mine {
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
    const mineManager = new MineManager(findMyRooms())
    mineManager.assignMines()
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
    private myRooms: Room[]
    constructor(myRooms: Room[]) {
        this.myRooms = myRooms
    }

    static create(): MineManager {
        return new MineManager(findMyRooms())
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
            const features = getConstructionFeaturesV3FromMemory(Memory.rooms[name])
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