/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable no-prototype-builtins */
/* eslint-disable @typescript-eslint/no-this-alias */

import * as Logger from 'utils/logger'
import { EXTENSION_COUNTS, SPAWN_COUNTS, TOWER_COUNTS, getSources } from './room'
import { FlatRoomPosition, NonObstacle, Obstacle, Position, isObstacle } from 'types'
import { List, Map, Record, RecordOf, Seq, ValueObject } from 'immutable'
import { includes, random, range, reverse, sortBy, times, uniqBy } from 'lodash'
import maxBy from 'lodash/maxBy'
import { wrap } from 'utils/profiling'

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

export interface LinkTypes {
    controller: FlatRoomPosition
    storage: FlatRoomPosition
    sourceContainers: {
        source: FlatRoomPosition
        container: FlatRoomPosition
        link: FlatRoomPosition
    }[]
}

export interface StationaryPoints {
    controllerLink: FlatRoomPosition
    storageLink: FlatRoomPosition
    sourceContainerLinks: {
        source: FlatRoomPosition
        point: FlatRoomPosition
    }[]
}

export class ImmutableRoomItem extends ImmutableRoomItemRecord implements IImmutableRoomItem {
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
        return this.x === 0 || this.x === 49 || this.y === 0 || this.y === 49
    }

    public isNearEdge(): boolean {
        return (
            this.isBetween(this.x, 0, 2) ||
            this.isBetween(this.y, 0, 2) ||
            this.isBetween(this.x, 47, 49) ||
            this.isBetween(this.y, 47, 49)
        )
    }

    private isBetween(num: number, a: number, b: number): boolean {
        return num >= a && num <= b
    }

    public canBuild(): boolean {
        return !(this.isObstacle() || this.isNearEdge() || this.nonObstacles.constructionSite)
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

    public get flatPos(): FlatRoomPosition {
        return { x: this.x, y: this.y, roomName: this.roomName }
    }

    public static unique(roomItems: ImmutableRoomItem[]): ImmutableRoomItem[] {
        return uniqBy(roomItems, (ri) => `${ri.x},${ri.y}`)
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

    public reduce<T>(reducer: (acc: T, val: ImmutableRoomItem) => T, initial: T): T {
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

    // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
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

    public setObstacle(x: number, y: number, obstacle: Obstacle): ImmutableRoom {
        const roomItem = this.get(x, y)
        return this.set(x, y, roomItem.set('obstacle', obstacle))
    }

    public setRoad(x: number, y: number, val: boolean): ImmutableRoom {
        return this.setNonObstacle(x, y, 'road', val)
    }

    public setConstructionSite(x: number, y: number, val: boolean): ImmutableRoom {
        return this.setNonObstacle(x, y, 'constructionSite', val)
    }

    public setNonObstacle(x: number, y: number, key: NonObstacle, value: boolean): ImmutableRoom {
        const roomItem = this.get(x, y)
        const nonObstacles = roomItem.get('nonObstacles')
        return this.set(x, y, roomItem.set('nonObstacles', nonObstacles.set(key, value)))
    }

    public getRandomWalkablePosition(x: number, y: number): RoomPosition | null {
        const neighbors = this.getClosestNeighbors(x, y)
        const walkableNeighbors = neighbors.filter((pos) => pos.canBuild())
        Logger.debug('walkable neighbors', x, y, JSON.stringify(walkableNeighbors))
        if (walkableNeighbors.length === 0) {
            return null
        }
        const index = random(walkableNeighbors.length - 1)
        const roomItem = walkableNeighbors[index]
        return new RoomPosition(roomItem.x, roomItem.y, this.name)
    }

    public getClosestNeighbors(x: number, y: number, r = 1): ImmutableRoomItem[] {
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
        let start = this.get(x, y)
        if (start.terrain === TERRAIN_MASK_WALL) {
            start = this.getClosestWalkable(start)
        }
        const queue = [start]
        const visited = new Set<ImmutableRoomItem>()
        while (queue.length > 0) {
            const roomItem = queue.shift() as ImmutableRoomItem
            if (visited.has(roomItem)) {
                continue
            }
            visited.add(roomItem)
            yield roomItem
            for (const neighbor of this.getClosestNeighbors(roomItem.x, roomItem.y)) {
                if (neighbor.terrain !== TERRAIN_MASK_WALL) {
                    queue.push(neighbor)
                }
            }
        }
    }

    private getClosestWalkable = (ri: ImmutableRoomItem): ImmutableRoomItem => {
        const queue = [this.get(ri.x, ri.y)]
        const visited = new Set<ImmutableRoomItem>()
        while (queue.length > 0) {
            const roomItem = queue.shift() as ImmutableRoomItem
            if (visited.has(roomItem)) {
                continue
            }
            visited.add(roomItem)
            for (const neighbor of this.getClosestNeighbors(roomItem.x, roomItem.y)) {
                if (neighbor.terrain !== TERRAIN_MASK_WALL) {
                    return neighbor
                }
                queue.push(neighbor)
            }
        }
        return ri
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

        // eslint-disable-next-line @typescript-eslint/no-this-alias
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

    public nextSpawnPos(): FlatRoomPosition {
        const centroid = this.findCentroid()
        for (const roomItem of this.breadthFirst(centroid.x, centroid.y)) {
            if (this.canPlaceSpawn(roomItem)) {
                return { x: roomItem.x, y: roomItem.y, roomName: this.name }
            }
        }
        throw new Error('No eligible spawn spot.')
    }

    public nextStoragePos(): FlatRoomPosition {
        const centroid = this.findCentroid()
        for (const roomItem of this.breadthFirst(centroid.x, centroid.y)) {
            if (this.canPlaceStorage(roomItem)) {
                return { x: roomItem.x, y: roomItem.y, roomName: this.name }
            } else {
                Logger.debug(
                    'immutable-room:nextStoragePos:cannot-place-storage',
                    this.name,
                    roomItem.x,
                    roomItem.y,
                )
            }
        }
        throw new Error(`No eligible storage spot. ${this.name}`)
    }

    public setStorage(): ImmutableRoom {
        const storage = this.getObstacles('storage')
        if (storage.length > 0) {
            return this
        }
        const pos = this.nextStoragePos()
        return this.setObstacle(pos.x, pos.y, 'storage')
    }

    public setSpawns(limit = SPAWN_COUNTS[8]): ImmutableRoom {
        const spawns = this.getObstacles('spawn')
        if (spawns.length >= limit) {
            return this
        }
        let iroom: ImmutableRoom = this
        for (let i = 0; i < SPAWN_COUNTS[8] - spawns.length; i++) {
            const pos = iroom.nextSpawnPos()
            iroom = iroom.setObstacle(pos.x, pos.y, 'spawn')
        }
        return iroom
    }

    public controllerLinkPos(): FlatRoomPosition {
        const room = Game.rooms[this.name]
        if (!room.controller) {
            Logger.error('immutable-room:controllerLinkPos:no-controller', this.name)
            throw new Error('No controller found.')
        }
        const pos = room.controller.pos
        this.getClosestNeighbors(pos.x, pos.y)
        const neighbors = this.getClosestNeighbors(pos.x, pos.y).filter(
            (ri) => !ri.isObstacle() || ri.obstacle === 'link',
        )
        const link = neighbors.find((ri) => ri.obstacle === 'link')
        if (link) {
            return link
        }
        if (neighbors.length === 0) {
            Logger.error('immutable-room:controllerLinkPos:no-neighbors', this.name, pos.x, pos.y)
            throw new Error('No neighbors found.')
        }
        const { x, y } = maxBy(neighbors, (n) => this.calculateEmptiness(n, 3)) as ImmutableRoomItem
        return new RoomPosition(x, y, this.name)
    }

    public hasControllerLink(): boolean {
        const room = Game.rooms[this.name]
        if (!room.controller) {
            Logger.error('immutable-room:hasControllerLink:no-controller', this.name)
            return false
        }
        const controller = room.controller
        return this.hasNearbyLink(controller.pos.x, controller.pos.y)
    }

    public hasStorageLink(): boolean {
        const storages = this.getObstacles('storage')
        if (storages.length === 0) {
            Logger.error('immutable-room:hasStorageLink:no-storage', this.name)
            return true
        }
        const storage = storages[0]
        return this.hasNearbyLink(storage.x, storage.y)
    }

    public setStorageLink(): ImmutableRoom {
        if (this.hasStorageLink()) {
            return this
        }
        const pos = this.storageLinkPos()
        return this.setObstacle(pos.x, pos.y, 'link')
    }

    public getStorageLink(): FlatRoomPosition {
        const storages = this.getObstacles('storage')
        const links = this.getNearbyLinks(storages[0].x, storages[0].y)
        if (links.length === 0) {
            throw new Error('No storage link found.')
        }
        return links[0]
    }

    public storageLinkPos(): FlatRoomPosition {
        const storages = this.getObstacles('storage')
        if (storages.length === 0) {
            throw new Error('No storage found.')
        }
        if (this.hasNearbyLink(storages[0].x, storages[0].y)) {
            return this.getNearbyLinks(storages[0].x, storages[0].y)[0]
        }
        const pos = storages[0]
        const neighbors = this.getClosestNeighbors(pos.x, pos.y).filter((ri) => !ri.isObstacle())
        const { x, y } = maxBy(neighbors, (n) => this.calculateEmptiness(n, 3)) as ImmutableRoomItem
        return new RoomPosition(x, y, this.name)
    }

    private hasNearbyLink(x: number, y: number): boolean {
        return this.getNearbyLinks(x, y).length > 0
    }

    private getNearbyLinks(x: number, y: number): ImmutableRoomItem[] {
        const links = this.getObstacles('link')
        const neighbors = this.getClosestNeighbors(x, y)
        return links.filter((link) => neighbors.includes(link))
    }

    /**
     * Finds the container assigned to each source in the room.
     *
     * @returns An array of tuples, where each tuple contains a source item
     *  and its corresponding container item (or null if no container is found).
     *  it's sorted by the number of neighbors each source has from least to most.
     */
    private getSourceContainerInfo(): {
        source: ImmutableRoomItem
        container: ImmutableRoomItem | null
        neighbors: ImmutableRoomItem[]
    }[] {
        const sources = this.getObstacles('source')
        const neighborPairs: [ImmutableRoomItem, ImmutableRoomItem[]][] = sortBy(
            sources.map((source) => [
                source,
                this.getClosestNeighbors(source.x, source.y).filter((ri) => !ri.isObstacle()),
            ]),
            ([, neighbors]) => neighbors.length,
        )
        const usedPositions = new Set<ImmutableRoomItem>()
        const sourceContainerInfo: {
            source: ImmutableRoomItem
            container: ImmutableRoomItem | null
            neighbors: ImmutableRoomItem[]
        }[] = []
        for (const [source, neighbors] of neighborPairs) {
            if (neighbors.length === 0) {
                Logger.error(
                    'immutable-room:getSourceContainerPairs:source-without-neighbors',
                    source,
                )
                return []
            }
            const containers = neighbors.filter(
                (ri) => ri.nonObstacles.container && !usedPositions.has(ri),
            )
            const nonContainers = neighbors.filter((ri) => !ri.nonObstacles.container)
            if (containers.length === 0) {
                sourceContainerInfo.push({
                    source,
                    container: null,
                    neighbors: nonContainers,
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
                    Logger.error(
                        'immutable-room:setSourceContainers:no-available-positions',
                        source,
                    )
                    return iroom
                }
                const ncontainer = this.sortByCentroidDistance(available)[0]
                usedPositions.add(ncontainer)
                iroom = iroom.setNonObstacle(ncontainer.x, ncontainer.y, 'container', true)
            }
        }
        return iroom
    }

    public getMappedSourceContainers(): { [key in Id<Source>]: Position } {
        const info = this.getSourceContainerInfo()
        const sources = getSources(Game.rooms[this.name])
        const map: { [key in Id<Source>]: Position } = {} as {
            [key in Id<Source>]: Position
        }
        for (const { source, container } of info) {
            if (container === null) {
                Logger.error('immutable-room:getMappedSourceContainers:no-container', source)
                continue
            }
            const sourceId = (
                sources.find((s) => s.pos.x === source.x && s.pos.y === source.y) as Source
            ).id
            map[sourceId] = container
        }
        if (Object.keys(map).length !== sources.length) {
            Logger.error('immutable-room:getMappedSourceContainers:source-mismatch', map, sources)
        }
        return map
    }

    public getStationaryPoints(): StationaryPoints {
        const linkTypes = this.linkTypes()
        const sourcePoints = linkTypes.sourceContainers.map(({ container, source }) => ({
            source,
            point: container,
        }))
        const controllerPoints = this.getClosestNeighbors(
            linkTypes.controller.x,
            linkTypes.controller.y,
        ).filter((ri) => !ri.isObstacle())
        if (controllerPoints.length === 0) {
            Logger.error('immutable-room:getStationaryPoints:no-controller-points')
            throw new Error(`No controller points found in room ${this.name}`)
        }
        const storagePoints = this.getClosestNeighbors(
            linkTypes.storage.x,
            linkTypes.storage.y,
        ).filter((ri) => {
            if (ri.isObstacle()) {
                return false
            }
            return this.getClosestNeighbors(ri.x, ri.y).some((r) => r.obstacle === 'storage')
        })
        // TODO: we should probably check that none of the stationary points overlap
        return {
            controllerLink: controllerPoints[0],
            storageLink: storagePoints[0],
            sourceContainerLinks: sourcePoints,
        }
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
            const available = neighbors.filter(
                (ri) => !ri.isObstacle() && !ri.nonObstacles.container,
            )
            const containerCountMap = available.map((ri) => {
                const nb = this.getClosestNeighbors(ri.x, ri.y)
                const containers = nb.filter((r) => r.nonObstacles.container)
                return { container: ri, count: containers.length }
            })
            const sorted = sortBy(containerCountMap, ({ count }) => count)
            const maxCount = sorted[sorted.length - 1].count
            const maxCountContainers = sorted.filter(({ count }) => count === maxCount)
            const pos = this.sortByCentroidDistance(
                maxCountContainers.map(({ container: c }) => c),
            )[0]
            return this.setObstacle(pos.x, pos.y, 'link').setSourceContainerLinks()
        }
        return this
    }

    public setControllerLink(): ImmutableRoom {
        if (this.hasControllerLink()) {
            return this
        }
        const pos = this.controllerLinkPos()
        return this.setObstacle(pos.x, pos.y, 'link')
    }

    public calculateEmptiness = (roomItem: ImmutableRoomItem, rangeLength: number): number => {
        const neighbors = this.getClosestNeighbors(roomItem.x, roomItem.y, rangeLength)
        return neighbors.reduce((acc, val) => (val.isObstacle() ? acc : acc + 1), 0)
    }

    private findCentroid(): FlatRoomPosition {
        let xAcc = 0
        let yAcc = 0
        let count = 0
        let pos: FlatRoomPosition | null = null
        for (const x of range(50)) {
            for (const y of range(50)) {
                if (includes(['spawn', 'source', 'controller'], this.get(x, y).obstacle)) {
                    xAcc += x
                    yAcc += y
                    count++
                }
            }
        }
        if (count === 0) {
            pos = { x: 25, y: 25, roomName: this.name }
        } else {
            const nx = Math.floor(xAcc / count)
            const ny = Math.floor(yAcc / count)
            pos = { x: nx, y: ny, roomName: this.name }
        }
        if (this.get(pos.x, pos.y).terrain === TERRAIN_MASK_WALL) {
            return this.getClosestWalkable(this.get(pos.x, pos.y)).flatPos
        }
        return pos
    }

    private canPlaceExtension(roomItem: ImmutableRoomItem): boolean {
        if (!roomItem.canBuild()) {
            return false
        }

        if (roomItem.nonObstacles.container) {
            return false
        }

        for (const ri of this.getCardinalNeighbors(roomItem.x, roomItem.y)) {
            if (!ri.canBuild()) {
                return false
            }
        }
        for (const ri of this.getClosestNeighbors(roomItem.x, roomItem.y)) {
            if (['controller', 'spawn', 'storage'].includes(ri.obstacle)) {
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
        return this.sortByCentroidDistance(this.getObstacles('extension')).map((ri) => ({
            x: ri.x,
            y: ri.y,
        }))
    }

    public sortedContainerPositions(): Position[] {
        return this.sortByCentroidDistance(this.getNonObstacles('container')).map((ri) => ({
            x: ri.x,
            y: ri.y,
        }))
    }

    public sortedTowerPositions(): Position[] {
        return this.sortByCentroidDistance(this.getObstacles('tower')).map((ri) => ({
            x: ri.x,
            y: ri.y,
        }))
    }

    public linkTypes(): LinkTypes {
        const containerInfo = this.getSourceContainerInfo()
        const sourceContainerLinks: {
            source: FlatRoomPosition
            container: FlatRoomPosition
            link: FlatRoomPosition
        }[] = []
        for (const { source, container } of containerInfo) {
            if (container === null) {
                throw new Error(
                    `No container found for source ${source.x}, ${source.y}, ${this.name}`,
                )
            }
            const links = this.getClosestNeighbors(container.x, container.y).filter(
                (ri) => ri.obstacle === 'link',
            )
            if (links.length === 0) {
                Logger.error(`immutable-room:linkTypes:no-link`, source.x, source.y, this.name)
                continue
            }
            sourceContainerLinks.push({
                source: source.flatPos,
                container: container.flatPos,
                link: links[0].flatPos,
            })
        }
        const centroid = this.findCentroid()
        const sortedSourceContainerLinks = reverse(
            sortBy(
                sourceContainerLinks,
                ({ container }) =>
                    Math.abs(container.x - centroid.x) + Math.abs(container.y - centroid.y),
            ),
        )

        const controllerLink = this.controllerLinkPos()
        const storageLink = this.getStorageLink()
        const linkArray = uniqBy(
            [...sortedSourceContainerLinks.map(({ link }) => link), controllerLink, storageLink],
            (ri) => `${ri.x},${ri.y}`,
        )

        const possibleLinks = this.getObstacles('link')

        if (possibleLinks.length !== linkArray.length) {
            Logger.error(
                'immutable-room:sortedLinkPositions:link-mismatch',
                possibleLinks.map((ri) => `(${ri.x}, ${ri.y})`),
                linkArray.map((ri) => `(${ri.x}, ${ri.y})`),
                this.get(39, 10),
            )
            throw new Error('Link mismatch for room: ${this.name}')
        }
        return {
            controller: controllerLink,
            storage: storageLink,
            sourceContainers: sortedSourceContainerLinks,
        }
    }

    public sortedLinkPositions(): Position[] {
        const linkTypes = this.linkTypes()
        return [
            linkTypes.sourceContainers[0].link,
            linkTypes.controller,
            linkTypes.storage,
            ...linkTypes.sourceContainers.slice(1).map(({ link }) => link),
        ].reduce((acc: FlatRoomPosition[], val: FlatRoomPosition) => {
            if (acc.some((ri) => ri.x === val.x && ri.y === val.y)) {
                return acc
            }
            return [...acc, val]
        }, [])
    }

    public isGoodRoadPosition(x: number, y: number): boolean {
        const ipos = this.get(x, y)
        return !ipos.isObstacle() && !ipos.nonObstacles.road
    }
}

interface RoomCache {
    [roomName: string]: ImmutableRoom
}
interface TimeCache {
    [time: number]: RoomCache
}
let cache: TimeCache = {}

export const fromRoomUncached = wrap((room: Room): ImmutableRoom => {
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
        immutableRoom = immutableRoom.setObstacle(controller.pos.x, controller.pos.y, 'controller')
    }

    for (const structure of structures) {
        if (includes(Object.keys(STRUCTURE_INFO), structure.structureType)) {
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
        if (isObstacle(constructionSite.structureType)) {
            immutableRoom = immutableRoom.setObstacle(pos.x, pos.y, constructionSite.structureType)
        } else {
            immutableRoom = immutableRoom.setNonObstacle(
                pos.x,
                pos.y,
                constructionSite.structureType as NonObstacle,
                true,
            )
        }
    }

    updateCache(room, immutableRoom)

    return immutableRoom
}, 'immutable-room:fromRoomUncached')

export const fromRoom = wrap((room: Room): ImmutableRoom => {
    if (cache[Game.time]) {
        const timeCache = cache[Game.time]
        if (timeCache[room.name]) {
            return timeCache[room.name]
        }
    } else {
        cache = {}
        cache[Game.time] = {} as RoomCache
    }
    return fromRoomUncached(room)
}, 'immutable-room:fromRoom')

export function updateCache(room: Room, immutableRoom: ImmutableRoom): void {
    cache[Game.time][room.name] = immutableRoom
}

export function clearImmutableRoomCache(): void {
    cache = {}
}
