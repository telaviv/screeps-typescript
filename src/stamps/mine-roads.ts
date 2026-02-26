import {
    CostCallback,
    MultiRoomCostCallback,
    createMultiRoomTerrainCost,
    createTerrainCostCallback,
    findMultiRoomPath,
    findPath,
    withMultiRoomObstacles,
    withMultiRoomPreferredPaths,
    withObstacles,
    withPreferred,
} from '../libs/pathfinding'
import { FlatRoomPosition, Position } from '../types'
import { Mine } from '../managers/mine-manager'
import * as Logger from '../utils/logger'

/**
 * Result of calculating roads from base to a remote mine
 */
export interface MineRoadResult {
    name: string
    exitPosition: FlatRoomPosition
    entrancePosition: FlatRoomPosition
    minerRoads: Position[] // Roads in base room
    /** Per-source full multi-room paths: sourceId → path from base storageLink to source container */
    sourcePaths: Record<string, FlatRoomPosition[]>
    /** Path between source containers within mine room (null if fewer than 2 sources) */
    sourceToSourcePath: FlatRoomPosition[] | null
    /** Full multi-room path from base storageLink to mine controller (range 1), or null */
    controllerPath: FlatRoomPosition[] | null
}

interface SourcePathsResult {
    sourcePaths: Record<string, FlatRoomPosition[]>
    exitPosition: FlatRoomPosition
    entrancePosition: FlatRoomPosition
    minerRoads: Position[]
}

/**
 * Identifies which source ID was reached by finding the source adjacent to the container.
 * Falls back to the closest source by Chebyshev distance.
 */
function findNearestSourceId(
    sourceEntries: [string, Position][],
    container: FlatRoomPosition,
): string {
    for (const [sourceId, sourcePos] of sourceEntries) {
        if (
            Math.max(Math.abs(sourcePos.x - container.x), Math.abs(sourcePos.y - container.y)) <= 1
        ) {
            return sourceId
        }
    }
    let bestId = sourceEntries[0][0]
    let minDist = Infinity
    for (const [sourceId, sourcePos] of sourceEntries) {
        const dist = Math.max(
            Math.abs(sourcePos.x - container.x),
            Math.abs(sourcePos.y - container.y),
        )
        if (dist < minDist) {
            minDist = dist
            bestId = sourceId
        }
    }
    return bestId
}

/**
 * Builds the multi-room cost callback for pathfinding from base to mine.
 * Prefers bunker road tiles, blocks all other bunker structures, and blocks source tiles.
 */
function buildMineRoadCostCallback(
    baseRoomName: string,
    storage: Position,
    baseBunkerBuildings: Map<string, Position[]>,
    mineName: string,
    sourcePositions: Position[],
): MultiRoomCostCallback {
    const obstacles = new Set<string>()
    const roadPositions = new Set<string>()

    for (const pos of baseBunkerBuildings.get('road') ?? []) {
        roadPositions.add(`${baseRoomName}:${pos.x},${pos.y}`)
    }

    for (const [structType, positions] of baseBunkerBuildings.entries()) {
        if (structType !== 'road' && structType !== 'rampart') {
            for (const pos of positions) {
                obstacles.add(`${baseRoomName}:${pos.x},${pos.y}`)
            }
        }
    }
    // Storage shouldn't block itself
    obstacles.delete(`${baseRoomName}:${storage.x},${storage.y}`)

    const sourceObstacles = new Set<string>(
        sourcePositions.map((pos) => `${mineName}:${pos.x},${pos.y}`),
    )

    let getCost: MultiRoomCostCallback = createMultiRoomTerrainCost()
    getCost = withMultiRoomPreferredPaths(getCost, roadPositions, 1)
    getCost = withMultiRoomObstacles(getCost, obstacles, 255)
    getCost = withMultiRoomObstacles(getCost, sourceObstacles, 255)
    return getCost
}

/**
 * Calculates per-source paths using a single base-room corridor.
 *
 * A multi-goal path finds the nearest source and establishes the exit/entrance
 * border crossing. Remaining sources are reached via single-room pathfinding
 * from the entrance, then prefixed with the shared base segment — so there is
 * always exactly one road corridor between the base and the mine.
 */
function calculateSourcePaths(
    baseRoomName: string,
    storage: Position,
    mineName: string,
    sourceEntries: [string, Position][],
    getCost: MultiRoomCostCallback,
): SourcePathsResult | null {
    // Multi-goal: find path to nearest source (original road behaviour)
    const allGoals: FlatRoomPosition[] = sourceEntries.map(([, pos]) => ({
        roomName: mineName,
        x: pos.x,
        y: pos.y,
    }))

    const nearestPath = findMultiRoomPath(
        { roomName: baseRoomName, x: storage.x, y: storage.y },
        allGoals,
        getCost,
        { range: 1 },
    )

    if (!nearestPath || nearestPath.length === 0) {
        Logger.error('calculateSourcePaths:no-path', mineName)
        return null
    }

    const baseSegment = nearestPath.filter((p) => p.roomName === baseRoomName)
    const nearestMineSegment = nearestPath.filter((p) => p.roomName === mineName)

    if (baseSegment.length === 0 || nearestMineSegment.length === 0) {
        Logger.error('calculateSourcePaths:empty-path-segment', mineName)
        return null
    }

    // With the 99-wide combined grid, the room border tile is shared and always decoded as the
    // mine (goal) side. So nearestMineSegment[0] is always the mine edge tile (x=0/49 or y=0/49).
    //
    // The pathfinder may take a diagonal step across the border (e.g. base (22,1) → mine (23,49)).
    // Screeps teleports preserve the coordinate parallel to the border axis, so the mine entrance
    // x (for N/S crossings) or y (for E/W crossings) is authoritative — the base exit must use
    // the same parallel coordinate. Using lastBaseTile's coordinate was wrong when the diagonal
    // went toward the road rather than away from it.
    const rawEntrancePosition = nearestMineSegment[0]
    const entrancePosition: FlatRoomPosition = rawEntrancePosition

    // Derive the base-side exit tile from the corrected mine entrance
    const exitPosition: FlatRoomPosition =
        entrancePosition.x === 0
            ? { roomName: baseRoomName, x: 49, y: entrancePosition.y }
            : entrancePosition.x === 49
            ? { roomName: baseRoomName, x: 0, y: entrancePosition.y }
            : entrancePosition.y === 0
            ? { roomName: baseRoomName, x: entrancePosition.x, y: 49 }
            : { roomName: baseRoomName, x: entrancePosition.x, y: 0 }

    const nearestContainer = nearestMineSegment[nearestMineSegment.length - 1]
    const nearestSourceId = findNearestSourceId(sourceEntries, nearestContainer)

    const sourcePaths: Record<string, FlatRoomPosition[]> = {}
    sourcePaths[nearestSourceId] = nearestPath

    // Remaining sources: route from entrance within mine room, share the base segment
    if (sourceEntries.length > 1) {
        const mineTerrainCost: CostCallback = createTerrainCostCallback(
            Game.map.getRoomTerrain(mineName),
        )

        // Track stationary (miner) positions computed so far — they must be treated as
        // impassable since a creep will permanently occupy that tile.
        const stationaryObstacles = new Set<string>()
        stationaryObstacles.add(`${nearestContainer.x},${nearestContainer.y}`)

        for (const [sourceId, sourcePos] of sourceEntries) {
            if (sourceId === nearestSourceId) continue

            const mineBaseCost = withObstacles(mineTerrainCost, stationaryObstacles)
            const mineInternalPath = findPath(
                { x: entrancePosition.x, y: entrancePosition.y },
                { x: sourcePos.x, y: sourcePos.y },
                mineBaseCost,
                { range: 1 },
            )

            if (!mineInternalPath || mineInternalPath.length === 0) {
                Logger.error('calculateSourcePaths:no-internal-path', mineName, sourceId)
                continue
            }

            // Full path: shared base segment → entrance → mine-internal path to source
            sourcePaths[sourceId] = [
                ...baseSegment,
                { x: entrancePosition.x, y: entrancePosition.y, roomName: mineName },
                ...mineInternalPath.map((p) => ({ x: p.x, y: p.y, roomName: mineName })),
            ]

            // Add this source's container to obstacles for subsequent source paths
            const newContainer = mineInternalPath[mineInternalPath.length - 1]
            stationaryObstacles.add(`${newContainer.x},${newContainer.y}`)
        }
    }

    // Miner roads: all base segment tiles. With the 99-wide grid the border edge tile is in
    // the mine segment, so there is no un-buildable edge tile to exclude here.
    const minerRoads = baseSegment.map(({ x, y }) => ({ x, y }))

    return { sourcePaths, exitPosition, entrancePosition, minerRoads }
}

/**
 * Calculates a path between the two source containers within the mine room.
 * Uses the mine road tiles from the source paths as preferred (low-cost) tiles.
 * Returns null if there are not exactly 2 sources or no path is found.
 */
function calculateSourceToSourcePath(
    mineName: string,
    sourcePaths: Record<string, FlatRoomPosition[]>,
): FlatRoomPosition[] | null {
    const sortedIds = Object.keys(sourcePaths).sort()
    if (sortedIds.length !== 2) {
        return null
    }

    const mineSegment1 = sourcePaths[sortedIds[0]].filter((p) => p.roomName === mineName)
    const mineSegment2 = sourcePaths[sortedIds[1]].filter((p) => p.roomName === mineName)

    if (mineSegment1.length === 0 || mineSegment2.length === 0) {
        return null
    }

    // pickup1 / pickup2: the hauler's standing tile for each source (one step before the
    // stationary point). All minePaths must start and end at pickup points so that
    // followMinePath's findIndex lookup succeeds at path transitions.
    const pickup1 = mineSegment1[mineSegment1.length - 2] ?? mineSegment1[mineSegment1.length - 1]
    const pickup2 = mineSegment2[mineSegment2.length - 2] ?? mineSegment2[mineSegment2.length - 1]

    const mineRoadPreferred = new Map<string, number>()
    for (const pos of [...mineSegment1, ...mineSegment2]) {
        mineRoadPreferred.set(`${pos.x},${pos.y}`, 1)
    }

    const mineBaseCost: CostCallback = createTerrainCostCallback(Game.map.getRoomTerrain(mineName))
    // findPath excludes the start node, so start from pickup1 and prepend it manually.
    // This guarantees s2sPath[0] === pickup1 and s2sPath[-1] === pickup2 exactly.
    const s2sRest = findPath(
        { x: pickup1.x, y: pickup1.y },
        { x: pickup2.x, y: pickup2.y },
        withPreferred(mineBaseCost, mineRoadPreferred),
        { range: 0 },
    )

    if (!s2sRest) {
        Logger.warning('calculateSourceToSourcePath:no-path', mineName)
        return null
    }

    return [pickup1, ...s2sRest].map((p) => ({ x: p.x, y: p.y, roomName: mineName }))
}

/**
 * Calculates a multi-room path from the base storageLink to the mine controller (range 1).
 */
function calculateControllerPath(
    baseRoomName: string,
    storage: Position,
    mineName: string,
    controllerPos: Position,
    getCost: MultiRoomCostCallback,
): FlatRoomPosition[] | null {
    const path = findMultiRoomPath(
        { roomName: baseRoomName, x: storage.x, y: storage.y },
        { roomName: mineName, x: controllerPos.x, y: controllerPos.y },
        getCost,
        { range: 1 },
    )

    if (!path || path.length === 0) {
        Logger.warning('calculateControllerPath:no-path', mineName)
        return null
    }

    return path
}

/**
 * Orchestrates all path calculations for a single mine. Returns null if no
 * source paths could be found.
 */
function calculateMineRoad(
    baseRoomName: string,
    storage: Position,
    mineName: string,
    baseBunkerBuildings: Map<string, Position[]>,
    sourceEntries: [string, Position][],
    controllerPos: Position | undefined,
): MineRoadResult | null {
    const getCost = buildMineRoadCostCallback(
        baseRoomName,
        storage,
        baseBunkerBuildings,
        mineName,
        sourceEntries.map(([, pos]) => pos),
    )

    const sourceResult = calculateSourcePaths(
        baseRoomName,
        storage,
        mineName,
        sourceEntries,
        getCost,
    )
    if (!sourceResult) {
        Logger.error('calculateMineRoad:no-valid-source-paths', mineName)
        return null
    }

    const { sourcePaths, exitPosition, entrancePosition, minerRoads } = sourceResult

    return {
        name: mineName,
        exitPosition,
        entrancePosition,
        minerRoads,
        sourcePaths,
        sourceToSourcePath: calculateSourceToSourcePath(mineName, sourcePaths),
        controllerPath: controllerPos
            ? calculateControllerPath(baseRoomName, storage, mineName, controllerPos, getCost)
            : null,
    }
}

/**
 * Calculates roads from base storage to remote mine sources using multi-room pathfinding.
 * Returns exit/entrance positions, road positions for the base room, and pre-calculated
 * paths for all remote hauler navigation (storage→source, source↔source, storage→controller).
 *
 * @param baseRoomName - Name of the base (miner) room
 * @param storage - Position of storage link in base room (start of all paths)
 * @param mines - List of mines assigned to this base room
 * @param baseBunkerBuildings - Map of structure types to positions in the base bunker
 * @returns Array of mine road results
 */
export function calculateMineRoads(
    baseRoomName: string,
    storage: Position,
    mines: Mine[],
    baseBunkerBuildings: Map<string, Position[]>,
): MineRoadResult[] {
    const results: MineRoadResult[] = []

    for (const mine of mines) {
        const scout = Memory.rooms[mine.name]?.scout
        if (!scout?.sourcePositions) {
            Logger.warning(
                'calculateMineRoads:no-scout-data',
                mine.name,
                'Skipping - no scout data',
            )
            continue
        }

        const result = calculateMineRoad(
            baseRoomName,
            storage,
            mine.name,
            baseBunkerBuildings,
            Object.entries(scout.sourcePositions),
            scout.controllerPosition,
        )

        if (result) {
            results.push(result)
        }
    }

    return results
}
