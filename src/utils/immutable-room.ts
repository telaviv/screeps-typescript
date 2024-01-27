/* eslint @typescript-eslint/no-explicit-any: "off" */
/* eslint no-prototype-builtins: "off" */

import { List, Map, Record, RecordOf, Seq, ValueObject } from 'immutable'
import maxBy from 'lodash/maxBy'

import RoomPlanner from 'room-planner'
import RoomSnapshot from 'snapshot'
import { includes, times, range, random } from 'lodash'
import * as Logger from 'utils/logger'
import { wrap } from 'utils/profiling'
import { FlatRoomPosition } from 'types'

type Obstacle = (typeof OBSTACLE_OBJECT_TYPES)[number]
type NonObstacle = 'road' | 'constructionSite' | 'rampart'

function isObstacle(x: any): x is Obstacle {
    return OBSTACLE_OBJECT_TYPES.includes(x)
}

function isNonObstacle(x: any): x is NonObstacle {
    return ['road', 'constructionSite', 'rampart'].includes(x)
}

interface NonObstacles {
    road: boolean
    constructionSite: boolean
    rampart: boolean
}

const NonObstaclesRecord = Record<NonObstacles>({
    road: false,
    rampart: false,
    constructionSite: false,
})

interface IImmutableRoomItem {
    x: number
    y: number
    terrain: number
    nonObstacles: RecordOf<NonObstacles>
    obstacle: Obstacle | ''
    roomName: string
}

const ImmutableRoomItemRecord = Record({
    x: 0,
    y: 0,
    terrain: 0,
    nonObstacles: NonObstaclesRecord(),
    obstacle: '',
    roomName: '',
})

export class ImmutableRoomItem
    extends ImmutableRoomItemRecord
    implements IImmutableRoomItem {
    public readonly x!: number
    public readonly y!: number
    public readonly terrain!: number
    public readonly nonObstacles!: RecordOf<NonObstacles>
    public readonly obstacle!: Obstacle | ''
    public readonly roomName!: string

    public isObstacle(): boolean {
        return !!this.obstacle || this.terrain === TERRAIN_MASK_WALL
    }

    public isAtEdge(): boolean {
        return (
            this.x === 0 ||
            this.x === 49 ||
            this.y === 0 ||
            this.y === 49
        )
    }

    public canBuild(): boolean {
        return !(this.isObstacle() || this.isAtEdge() || this.nonObstacles.constructionSite)
    }

    public terrainString(): string {
        if (this.terrain === 1) {
            return 'wall'
        }

        if (this.terrain === 2) {
            return 'swamp'
        }

        return 'plain'
    }

    public get pos(): RoomPosition {
        return new RoomPosition(this.x, this.y, this.roomName)
    }
}

type RoomGrid = List<List<ImmutableRoomItem>>

export class ImmutableRoom implements ValueObject {
    private readonly grid: RoomGrid
    public readonly name: string

    public constructor(name: string, grid?: RoomGrid) {
        if (grid) {
            this.grid = grid
        } else {
            this.grid = Seq(
                times(50, (x: number) =>
                    Seq(
                        times(
                            50,
                            (y: number) =>
                                new ImmutableRoomItem({
                                    x,
                                    y,
                                    roomName: name,
                                    terrain: 0,
                                }),
                        ),
                    ).toList(),
                ),
            ).toList()
        }
        this.name = name
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    public equals(other: any): boolean {
        return this.grid.equals(other)
    }

    public hashCode(): number {
        return Map({ name: this.name, grid: this.grid }).hashCode()
    }

    public get(x: number, y: number): ImmutableRoomItem {
        return this.grid.getIn([x, y]) as ImmutableRoomItem
    }

    public set(x: number, y: number, item: ImmutableRoomItem): ImmutableRoom {
        return new ImmutableRoom(this.name, this.grid.setIn([x, y], item))
    }

    public setTerrain(x: number, y: number, terrain: number): ImmutableRoom {
        const roomItem = this.get(x, y)
        return this.set(x, y, roomItem.set('terrain', terrain))
    }

    public setObstacle(
        x: number,
        y: number,
        obstacle: Obstacle,
    ): ImmutableRoom {
        const roomItem = this.get(x, y)
        return this.set(x, y, roomItem.set('obstacle', obstacle))
    }

    public setRoad(x: number, y: number, val: boolean): ImmutableRoom {
        return this.setNonObstacle(x, y, 'road', val)
    }

    public setConstructionSite(
        x: number,
        y: number,
        val: boolean,
    ): ImmutableRoom {
        return this.setNonObstacle(x, y, 'constructionSite', val)
    }

    public setNonObstacle(
        x: number,
        y: number,
        key: NonObstacle,
        value: boolean,
    ) {
        const roomItem = this.get(x, y)
        const nonObstacles = roomItem.get('nonObstacles')
        return this.set(
            x,
            y,
            roomItem.set('nonObstacles', nonObstacles.set(key, value)),
        )
    }

    public getRandomWalkablePosition(
        x: number,
        y: number,
    ): RoomPosition | null {
        const neighbors = this.getClosestNeighbors(x, y)
        const walkableNeighbors = neighbors.filter((pos) => pos.canBuild())
        Logger.debug(
            'walkable neighbors',
            x,
            y,
            JSON.stringify(walkableNeighbors),
        )
        if (walkableNeighbors.length === 0) {
            return null
        }
        const index = random(walkableNeighbors.length - 1)
        const roomItem = walkableNeighbors[index]
        return new RoomPosition(roomItem.x, roomItem.y, this.name)
    }

    public getClosestNeighbors(
        x: number,
        y: number,
        r = 1,
    ): ImmutableRoomItem[] {
        const neighbors = []
        for (let nx = Math.max(0, x - r); nx <= Math.min(50, x + r); ++nx) {
            for (let ny = Math.max(0, y - r); ny <= Math.min(50, y + r); ++ny) {
                if (!(x === nx && y === ny) && this.get(nx, ny)) {
                    neighbors.push(this.get(nx, ny))
                }
            }
        }
        return neighbors
    }

    public getCardinalNeighbors = function* (
        this: ImmutableRoom,
        x: number,
        y: number,
    ): Generator<ImmutableRoomItem, void, unknown> {
        const deltas = [
            [-1, 0],
            [1, 0],
            [0, -1],
            [0, 1],
        ]
        for (const [dx, dy] of deltas) {
            const nx = x + dx
            const ny = y + dy
            if (nx >= 0 && nx < 50 && ny >= 0 && ny < 50) {
                yield this.get(nx, ny)
            }
        }
    }

    public spiral = function* (
        this: ImmutableRoom,
        x: number,
        y: number,
    ): Generator<ImmutableRoomItem, void, unknown> {
        let nx = 0
        let ny = 0
        let dx = 0
        let dy = -1
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        for (const _ of range(2500)) {
            const px = x + nx
            const py = y + ny
            if (px >= 0 && px < 50 && py >= 0 && py < 50) {
                yield this.get(px, py)
            }
            if (
                nx === ny ||
                (nx < 0 && nx === -ny) ||
                (nx > 0 && nx === 1 - ny)
            ) {
                const temp = dx
                dx = -dy
                dy = temp
            }
            nx += dx
            ny += dy
        }
    }

    public nextExtensionPos(): FlatRoomPosition {
        const centroid = this.findCentroid()
        for (const roomItem of this.spiral(centroid.x, centroid.y)) {
            if (this.canPlaceExtension(roomItem)) {
                return { x: roomItem.x, y: roomItem.y, roomName: this.name }
            } else {
                console.log('cant place extension', roomItem.x, roomItem.y)
            }
        }
        throw new Error('No eligible extension spot.')
    }

    public nextTowerPos(): FlatRoomPosition {
        return this.nextExtensionPos()
    }

    public nextSpawnPos(): RoomPosition {
        const centroid = this.findCentroid()
        for (const roomItem of this.spiral(centroid.x, centroid.y)) {
            if (this.canPlaceSpawn(roomItem)) {
                return new RoomPosition(roomItem.x, roomItem.y, this.name)
            }
        }
        throw new Error('No eligible spawn spot.')
    }

    public nextStoragePos(): RoomPosition {
        const centroid = this.findCentroid()
        for (const roomItem of this.spiral(centroid.x, centroid.y)) {
            if (this.canPlaceStorage(roomItem)) {
                return new RoomPosition(roomItem.x, roomItem.y, this.name)
            }
        }
        throw new Error('No eligible storage spot.')
    }

    public controllerLinkPos(): RoomPosition {
        const room = Game.rooms[this.name]
        const pos = room.controller!.pos
        const neighbors = this.getClosestNeighbors(pos.x, pos.y, 3).filter(
            (ri) => !ri.isObstacle(),
        )
        const { x, y } = maxBy(neighbors, (n) => this.calculateEmptiness(n, 3))!
        return new RoomPosition(x, y, this.name)
    }

    public calculateEmptiness = (
        roomItem: ImmutableRoomItem,
        rangeLength: number,
    ): number => {
        const neighbors = this.getClosestNeighbors(
            roomItem.x,
            roomItem.y,
            rangeLength,
        )
        return neighbors.reduce(
            (acc, val) => (val.isObstacle() ? acc : acc + 1),
            0,
        )
    }

    private findCentroid(): FlatRoomPosition {
        let xAcc = 0
        let yAcc = 0
        let count = 0
        for (const x of range(50)) {
            for (const y of range(50)) {
                if (
                    includes(
                        ['spawn', 'source', 'controller'],
                        this.get(x, y).obstacle,
                    )
                ) {
                    xAcc += x
                    yAcc += y
                    count++
                }
            }
        }
        const nx = Math.floor(xAcc / count)
        const ny = Math.floor(yAcc / count)
        return { x: nx, y: ny, roomName: this.name }
    }

    private canPlaceExtension(roomItem: ImmutableRoomItem): boolean {
        if (!roomItem.canBuild()) {
            return false
        }

        for (const ri of this.getCardinalNeighbors(roomItem.x, roomItem.y)) {
            if (!ri.canBuild()) {
                return false
            }
        }
        return true
    }

    private canPlaceSpawn(roomItem: ImmutableRoomItem): boolean {
        if (!roomItem.canBuild()) {
            return false
        }

        for (const ri of this.getClosestNeighbors(roomItem.x, roomItem.y, 2)) {
            if (!ri.canBuild()) {
                return false
            }
        }
        return true
    }

    private canPlaceStorage(roomItem: ImmutableRoomItem): boolean {
        if (!roomItem.canBuild()) {
            return false
        }

        for (const ri of this.getClosestNeighbors(roomItem.x, roomItem.y, 1)) {
            if (!ri.canBuild()) {
                return false
            }
        }
        return true
    }
}

interface RoomCache {
    [roomName: string]: ImmutableRoom
}
interface TimeCache {
    [time: number]: RoomCache
}
let cache: TimeCache = {}

export const fromRoom = wrap(
    (room: Room, includeSnapshot = true): ImmutableRoom => {
        if (cache.hasOwnProperty(Game.time)) {
            const timeCache = cache[Game.time]
            if (timeCache.hasOwnProperty(room.name)) {
                return timeCache[room.name]
            }
        } else if (!cache.hasOwnProperty(Game.time)) {
            cache = {}
            cache[Game.time] = {} as RoomCache
        }

        let immutableRoom = new ImmutableRoom(room.name)
        const terrain = room.getTerrain()
        for (let x = 0; x < 50; ++x) {
            for (let y = 0; y < 50; ++y) {
                const terrainItem = terrain.get(x, y)
                if (terrainItem !== 0) {
                    immutableRoom = immutableRoom.setTerrain(x, y, terrainItem)
                }
            }
        }

        interface StructureMap {
            [index: string]: Obstacle
        }

        const STRUCTURE_INFO: StructureMap = {
            [STRUCTURE_LINK]: 'link',
            [STRUCTURE_STORAGE]: 'storage',
            [STRUCTURE_EXTENSION]: 'extension',
            [STRUCTURE_SPAWN]: 'spawn',
            [STRUCTURE_TOWER]: 'tower',
            [STRUCTURE_WALL]: 'constructedWall',
        }

        const controller = room.controller
        const structures = room.find(FIND_STRUCTURES)
        const sources = room.find(FIND_SOURCES)
        const constructionSites = room.find(FIND_CONSTRUCTION_SITES)

        if (controller) {
            immutableRoom = immutableRoom.setObstacle(
                controller.pos.x,
                controller.pos.y,
                'controller',
            )
        }

        for (const structure of structures) {
            if (
                includes(Object.keys(STRUCTURE_INFO), structure.structureType)
            ) {
                const pos = structure.pos
                immutableRoom = immutableRoom.setObstacle(
                    pos.x,
                    pos.y,
                    STRUCTURE_INFO[structure.structureType],
                )
            } else if (structure.structureType === STRUCTURE_ROAD) {
                const pos = structure.pos
                immutableRoom = immutableRoom.setRoad(pos.x, pos.y, true)
            }
        }

        for (const source of sources) {
            const pos = source.pos
            immutableRoom = immutableRoom.setObstacle(pos.x, pos.y, 'source')
        }

        for (const constructionSite of constructionSites) {
            const pos = constructionSite.pos
            immutableRoom = immutableRoom.setConstructionSite(
                pos.x,
                pos.y,
                true,
            )
        }

        if (includeSnapshot) {
            immutableRoom = mergeRoomPlan(immutableRoom)
            immutableRoom = mergeSnapshot(immutableRoom)
        }

        updateCache(room, immutableRoom)

        return immutableRoom
    },
    'immutable-room:fromRoom',
)

export function mergeRoomPlan(immutableRoom: ImmutableRoom): ImmutableRoom {
    let iroom = immutableRoom
    const room = Game.rooms[immutableRoom.name]
    const roomPlanner = new RoomPlanner(room)
    if (roomPlanner.storage) {
        const pos = roomPlanner.storage
        const roomItem = iroom.get(pos.x, pos.y)
        if (roomItem.obstacle && roomItem.obstacle !== 'storage') {
            Logger.warning(
                'immutable-room:mergeSnapshot:overwrite',
                pos,
                'storage',
            )
        }
        iroom = iroom.setObstacle(pos.x, pos.y, 'storage')
    }
    return iroom
}

export function mergeSnapshot(iroom: ImmutableRoom): ImmutableRoom {
    const room = Game.rooms[iroom.name]
    const snapshot = RoomSnapshot.get(room)
    let niroom = iroom

    for (const [pos, structureTypes] of snapshot.snapshot) {
        for (const structureType in structureTypes) {
            if (isObstacle(structureType)) {
                const existingObstacle = niroom.get(pos.x, pos.y).obstacle
                if (existingObstacle && existingObstacle !== structureType) {
                    Logger.warning(
                        'immutable-room:mergeSnapshot:overwrite',
                        pos,
                        structureType,
                    )
                }
                niroom = niroom.setObstacle(pos.x, pos.y, structureType)
            } else if (isNonObstacle(structureType)) {
                niroom = niroom.setNonObstacle(
                    pos.x,
                    pos.y,
                    structureType,
                    true,
                )
            }
        }
    }

    return niroom
}

export function updateCache(room: Room, immutableRoom: ImmutableRoom) {
    cache[Game.time][room.name] = immutableRoom
}
