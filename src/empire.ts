import WarDepartment, { SpawnWarMemory, WarMemory, WarStatus } from 'war-department'
import { RoomTask } from 'managers/room-manager'
import { World } from 'utils/world'
import { findMyRooms } from 'utils/room'
import { profile } from 'utils/profiling'

const isSpawnWarMemory = (mem: WarMemory): mem is SpawnWarMemory => mem.status === WarStatus.SPAWN

export default class Empire {
    private rooms: Room[]
    constructor() {
        this.rooms = Object.values(Game.rooms)
    }

    @profile
    public run(): void {
        this.clearSaviors()
        // this.findSaviors()
        for (const room of this.rooms) {
            const warDepartment = new WarDepartment(room)
            warDepartment.update()
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
                if (memory.sourceCount !== 2 || memory.controllerOwner) return false
                const neighbors = world.getClosestRooms([roomName], 1)
                return !neighbors.some(
                    ({ roomName: name }) =>
                        Memory.rooms[name]?.scout?.controllerOwner &&
                        !Game.rooms[name]?.controller?.my,
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
