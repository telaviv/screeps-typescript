/* eslint @typescript-eslint/no-explicit-any: "off" */
/* eslint no-prototype-builtins: "off" */

import { List, Map, Record, RecordOf, Seq, ValueObject } from 'immutable'
import maxBy from 'lodash/maxBy'

import RoomPlanner from 'room-planner'
import RoomSnapshot from 'snapshot'
import { includes, times, range, random, sortBy } from 'lodash'
import * as Logger from 'utils/logger'
import { wrap } from 'utils/profiling'
import { FlatRoomPosition, Position } from 'types'
import { EXTENSION_COUNTS, TOWER_COUNTS } from './room'

type Obstacle = (typeof OBSTACLE_OBJECT_TYPES)[number]
type NonObstacle = 'road' | 'constructionSite' | 'rampart' | 'container'

function isObstacle(x: any): x is Obstacle {
    return OBSTACLE_OBJECT_TYPES.includes(x)
}

function isNonObstacle(x: any): x is NonObstacle {
    return ['road', 'constructionSite', 'rampart', 'container'].includes(x)
}

interface NonObstacles {
    road: boolean
    constructionSite: boolean
    rampart: boolean
    container: boolean
}

const NonObstaclesRecord = Record<NonObstacles>({
    road: false,
    rampart: false,
    container: false,
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

    public distanceTo(other: ImmutableRoomItem | FlatRoomPosition): number {
        return Math.sqrt((this.x - other.x) ** 2 + (this.y - other.y) ** 2)
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

    public reduce<T>(
        reducer: (acc: T, val: ImmutableRoomItem) => T,
        initial: T,
    ): T {
        let acc = initial
        for (const x of range(50)) {
            for (const y of range(50)) {
                acc = reducer(acc, this.get(x, y))
            }
        }
        return acc
    }

    public getObstacles(type: string): ImmutableRoomItem[] {
        return this.reduce<ImmutableRoomItem[]>((acc, val) => {
            if (val.obstacle === type) {
                acc.push(val)
            }
            return acc
        }, [])
    }

    public getNonObstacles(type: NonObstacle): ImmutableRoomItem[] {
        return this.reduce<ImmutableRoomItem[]>((acc, val) => {
            if (val.nonObstacles[type]) {
                acc.push(val)
            }
            return acc
        }, [])
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

    public breadthFirst = function* (
        this: ImmutableRoom,
        x: number,
        y: number,
    ): Generator<ImmutableRoomItem, void, unknown> {
        const queue = [this.get(x, y)]
        const visited = new Set<ImmutableRoomItem>()
        while (queue.length > 0) {
            const roomItem = queue.shift()!
            if (visited.has(roomItem)) {
                continue
            }
            visited.add(roomItem)
            yield roomItem
            for (const neighbor of this.getClosestNeighbors(
                roomItem.x,
                roomItem.y,
            )) {
                queue.push(neighbor)
            }
        }
    }

    public nextExtensionPos(): FlatRoomPosition {
        const centroid = this.findCentroid()
        for (const roomItem of this.breadthFirst(centroid.x, centroid.y)) {
            if (this.canPlaceExtension(roomItem)) {
                return { x: roomItem.x, y: roomItem.y, roomName: this.name }
            }
        }
        throw new Error('No eligible extension spot.')
    }

    public setExtensions(limit = EXTENSION_COUNTS[8]): ImmutableRoom {
        let count = this.getObstacles('extension').length
        if (count >= limit) {
            return this
        }

        let iroom: ImmutableRoom = this
        while (count < limit) {
            const pos = iroom.nextExtensionPos()
            iroom = iroom.setObstacle(pos.x, pos.y, 'extension')
            count++
        }

        return iroom
    }

    public nextTowerPos(): FlatRoomPosition {
        return this.nextExtensionPos()
    }

    public setTowers(limit = TOWER_COUNTS[8]): ImmutableRoom {
        let count = this.getObstacles('tower').length
        if (count >= limit) {
            return this
        }

        let iroom: ImmutableRoom = this
        while (count < limit) {
            const pos = iroom.nextTowerPos()
            iroom = iroom.setObstacle(pos.x, pos.y, 'tower')
            count++
        }

        return iroom
    }

    public nextSpawnPos(): RoomPosition {
        const centroid = this.findCentroid()
        for (const roomItem of this.breadthFirst(centroid.x, centroid.y)) {
            if (this.canPlaceSpawn(roomItem)) {
                return new RoomPosition(roomItem.x, roomItem.y, this.name)
            }
        }
        throw new Error('No eligible spawn spot.')
    }

    public nextStoragePos(): FlatRoomPosition {
        const centroid = this.findCentroid()
        for (const roomItem of this.breadthFirst(centroid.x, centroid.y)) {
            if (this.canPlaceStorage(roomItem)) {
                return { x: roomItem.x, y: roomItem.y, roomName: this.name }
            }
        }
        throw new Error('No eligible storage spot.')
    }

    public setStorage(): ImmutableRoom {
        const storage = this.getObstacles('storage')
        if (storage.length > 0) {
            return this
        }
        const pos = this.nextStoragePos()
        return this.setObstacle(pos.x, pos.y, 'storage')
    }

    public controllerLinkPos(): FlatRoomPosition {
        const room = Game.rooms[this.name]
        const pos = room.controller!.pos
        const neighbors = this.getClosestNeighbors(pos.x, pos.y).filter(
            (ri) => !ri.isObstacle(),
        )
        const { x, y } = maxBy(neighbors, (n) => this.calculateEmptiness(n, 3))!
        return new RoomPosition(x, y, this.name)
    }

    public hasControllerLink(): boolean {
        const room = Game.rooms[this.name]
        const controller = room.controller!
        return this.hasNearbyLink(controller.pos.x, controller.pos.y)
    }

    public hasStorageLink(): boolean {
        const room = Game.rooms[this.name]
        const storage = room.storage
        if (!storage) {
            return true
        }
        return this.hasNearbyLink(storage.pos.x, storage.pos.y)
    }

    public setStorageLink(): ImmutableRoom {
        if (this.hasStorageLink()) {
            return this
        }
        const pos = this.storageLinkPos()
        return this.setObstacle(pos.x, pos.y, 'link')
    }

    public storageLinkPos(): FlatRoomPosition {
        const storages = this.getObstacles('storage')
        if (storages.length === 0) {
            throw new Error('No storage found.')
        }
        const pos = storages[0]
        const neighbors = this.getClosestNeighbors(pos.x, pos.y).filter(
            (ri) => !ri.isObstacle(),
        )
        const { x, y } = maxBy(neighbors, (n) => this.calculateEmptiness(n, 3))!
        return new RoomPosition(x, y, this.name)
    }

    private hasNearbyLink(x: number, y: number): boolean {
        const links = this.getObstacles('link')
        const neighbors = this.getClosestNeighbors(x, y)
        for (const link of links) {
            if (neighbors.includes(link)) {
                return true
            }
        }
        return false
    }

    /**
     * Finds the container assigned to each source in the room.
     *
     * @returns An array of tuples, where each tuple contains a source item
     *  and its corresponding container item (or null if no container is found).
     *  it's sorted by the number of neighbors each source has from least to most.
     */
    private getSourceContainerInfo(): {
        source: ImmutableRoomItem,
        container: ImmutableRoomItem | null,
        neighbors: ImmutableRoomItem[]
    }[] {
        const sources = this.getObstacles('source')
        const neighborPairs: [ImmutableRoomItem, ImmutableRoomItem[]][] = sortBy(sources.map(
            (source) => [
                source,
                this.getClosestNeighbors(source.x, source.y).filter((ri) => !ri.isObstacle()),
            ]
        ), ([_, neighbors]) => neighbors.length)
        const usedPositions = new Set<ImmutableRoomItem>()
        const sourceContainerInfo: {
            source: ImmutableRoomItem,
            container: ImmutableRoomItem | null,
            neighbors: ImmutableRoomItem[],
        }[] = []
        for (const [source, neighbors] of neighborPairs) {
            if (neighbors.length === 0) {
                Logger.error('immutable-room:getSourceContainerPairs:source-without-neighbors', source)
                return []
            }
            const containers = neighbors.filter((ri) => ri.nonObstacles.container && !usedPositions.has(ri))
            const nonContainers = neighbors.filter((ri) => !ri.nonObstacles.container)
            if (containers.length === 0) {
                sourceContainerInfo.push({
                    source,
                    container: null,
                    neighbors: nonContainers
                })
            } else {
                const container = containers[0]
                usedPositions.add(container)
                sourceContainerInfo.push({
                    source,
                    container,
                    neighbors: nonContainers,
                })
            }
        }
        return sourceContainerInfo
    }

    public setSourceContainers(): ImmutableRoom {
        const info = this.getSourceContainerInfo()
        let iroom: ImmutableRoom = this
        const usedPositions = new Set<ImmutableRoomItem>()
        for (const { source, container, neighbors } of info) {
            if (container === null) {
                const available = neighbors.filter((ri) => !usedPositions.has(ri))
                if (available.length === 0) {
                    Logger.error('immutable-room:setSourceContainers:no-available-positions', source)
                    return iroom
                }
                const ncontainer = this.sortByCentroidDistance(available)[0]
                usedPositions.add(ncontainer)
                iroom = iroom.setNonObstacle(ncontainer.x, ncontainer.y, 'container', true)
            }
        }
        return iroom
    }

    private sortByCentroidDistance(roomItems: ImmutableRoomItem[]): ImmutableRoomItem[] {
        const centroid = this.findCentroid()
        return sortBy(roomItems, (ri) => ri.distanceTo(centroid))
    }

    public setSourceContainerLinks(): ImmutableRoom {
        const info = this.getSourceContainerInfo()
        for (const { container } of info) {
            if (container == null) {
                continue
            }
            const neighbors = this.getClosestNeighbors(container.x, container.y)
            const links = neighbors.filter((ri) => ri.obstacle === 'link')
            if (links.length > 0) {
                continue
            }
            const available = neighbors.filter((ri) => !ri.isObstacle() && !ri.nonObstacles.container)
            const containerCountMap = available.map((ri) => {
                const neighbors = this.getClosestNeighbors(ri.x, ri.y)
                const containers = neighbors.filter((ri) => ri.nonObstacles.container)
                return { container: ri, count: containers.length }
            })
            const sorted = sortBy(containerCountMap, ({ count }) => count)
            const maxCount = sorted[sorted.length - 1].count
            const maxCountContainers = sorted.filter(({ count }) => count === maxCount)
            const pos = this.sortByCentroidDistance(maxCountContainers.map(({ container }) => container))[0]
            return this.setObstacle(pos.x, pos.y, 'link').setSourceContainerLinks()
        }
        return this;
    }

    public setControllerLink(): ImmutableRoom {
        if (this.hasControllerLink()) {
            return this
        }
        const pos = this.storageLinkPos()
        return this.setObstacle(pos.x, pos.y, 'link')
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
        if (count === 0) {
            return { x: 25, y: 25, roomName: this.name }
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

    public sortedExtensionPositions(): Position[] {
        return this.sortByCentroidDistance(this.getObstacles('extension')).map(
            (ri) => ({ x: ri.x, y: ri.y }),
        )
    }

    public sortedContainerPositions(): Position[] {
        return this.sortByCentroidDistance(this.getNonObstacles('container')).map(
            (ri) => ({ x: ri.x, y: ri.y }),
        )
    }

    public sortedTowerPositions(): Position[] {
        return this.sortByCentroidDistance(this.getObstacles('tower')).map(
            (ri) => ({ x: ri.x, y: ri.y }),
        )
    }

    public sortedLinkPositions(): Position[] {
        const containerInfo = this.getSourceContainerInfo()
        const sourceContainers = containerInfo.map(({ container }) => container).filter((ri) => ri !== null) as ImmutableRoomItem[]
        const storageLink = 
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
    (room: Room): ImmutableRoom => {
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

        updateCache(room, immutableRoom)

        return immutableRoom
    },
    'immutable-room:fromRoom',
)

export function updateCache(room: Room, immutableRoom: ImmutableRoom) {
    cache[Game.time][room.name] = immutableRoom
}
