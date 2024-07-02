import * as Logger from 'utils/logger'
import { RoomManager, RoomTask } from 'managers/room-manager'
import WarDepartment, { SpawnWarMemory, WarMemory, WarStatus } from 'war-department'
import { ScoutManager } from 'managers/scout-manager'
import { World } from 'utils/world'
import { findMyRooms } from 'utils/room'
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

export default class Empire {
    private rooms: Room[]
    constructor() {
        this.rooms = findMyRooms()
    }

    @profile
    public run(): void {
        this.clearSaviors()
        // this.findSaviors()

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

        const tasks = RoomManager.getAllClaimTasks()
        if (tasks.some((task) => task.data.name === roomName)) return
        for (const r of this.rooms) {
            if (r.memory.war?.target === roomName) return
        }

        const claimerName = this.findBestClaimer(roomName)
        if (!claimerName) {
            Logger.error(`empire:autoclaim: no claimer found for ${roomName}`)
            return
        }
        const claimer = Game.rooms[claimerName]
        if ((claimer.memory.war?.status ?? WarStatus.NONE) !== WarStatus.NONE) return

        const warDepartment = new WarDepartment(claimer)
        if (Memory.rooms[roomName]?.scout?.hasInvaderCore) {
            warDepartment.declareWar(roomName)
        } else {
            new RoomManager(claimer).addClaimRoomTask(roomName)
        }
    }

    findClaimCandidates(): string[] {
        const world = new World()
        const roomNames = findMyRooms().map((room) => room.name)
        const closestRooms = world.getClosestRooms(roomNames, 2)
        return closestRooms
            .filter(({ roomName }) => {
                const memory = Memory.rooms[roomName]?.scout
                if (!memory) return false
                if (memory.sourceCount !== 2 || memory.controllerOwner || memory.enemyThatsMining)
                    return false
                const neighbors = world.getClosestRooms([roomName], 1)
                // if any neighbor is owned by an enemy, don't claim
                return !neighbors.some(
                    ({ roomName: name }) =>
                        Memory.rooms[name]?.scout?.controllerOwner &&
                        Memory.rooms[name]?.scout?.controllerOwner !== global.USERNAME,
                )
            })
            .map((room) => room.roomName)
    }

    findBestClaimer(roomName: string): string | null {
        const world = new World()
        const maxDistance = 2
        const closestRooms = world.getClosestRooms([roomName], maxDistance)
        const candidates = closestRooms.filter(
            ({ roomName: name }) => Game.rooms[name]?.controller?.my,
        )
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
        return candidates[0].roomName
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
