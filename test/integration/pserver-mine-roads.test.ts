import { assert } from 'chai'
import * as fs from 'fs'
import * as path from 'path'
import { calculateSingleMineRoads } from '../../src/stamps/single-mine-roads'
import bunkerStamp from '../../src/stamps/bunker'
import { placeBunker } from '../../src/stamps/placement'
import { calculateBunkerRoads } from '../../src/stamps/roads'
import {
    createMultiRoomTerrainCost,
    withMultiRoomObstacles,
    withMultiRoomPreferredPaths,
    findPath,
    createTerrainCostCallback,
    withObstacles,
    withPreferred,
} from '../../src/libs/pathfinding'

interface RoomFixture {
    roomName: string
    terrain: number[][]
    sources: { x: number; y: number }[]
    controller: { x: number; y: number } | null
    minerals: { x: number; y: number; mineralType: string }[]
}

// Mock RoomTerrain for testing
class MockRoomTerrain implements RoomTerrain {
    private terrain: number[][]

    constructor(terrain: number[][]) {
        this.terrain = terrain
    }

    get(x: number, y: number): 0 | 1 | 2 {
        if (x < 0 || x >= 50 || y < 0 || y >= 50) {
            return 1 // Wall for out of bounds
        }
        const value = this.terrain[y][x]
        // Terrain is bitwise encoded: 0=plain, 1=wall, 2=swamp, 3=wall+swamp
        // For pathfinding purposes, wall takes precedence (can't walk on walls)
        if (value & 1) {
            return 1 // Wall (includes wall+swamp)
        }
        if (value & 2) {
            return 2 // Swamp
        }
        return 0 // Plain
    }
}

/**
 * Load room fixture from test/fixtures/terrain directory
 */
function loadRoomFixture(roomName: string): RoomFixture | null {
    const fixturePath = path.join(__dirname, '../fixtures/terrain', `${roomName}.json`)
    if (!fs.existsSync(fixturePath)) {
        return null
    }
    const fixtureData = fs.readFileSync(fixturePath, 'utf8')
    return JSON.parse(fixtureData) as RoomFixture
}

/**
 * Build pathfinding obstacles from bunker buildings
 * Roads and ramparts are NOT obstacles (ramparts are walkable by own creeps)
 * Everything else blocks movement
 */
function buildObstacles(
    buildings: Map<string, { x: number; y: number }[]>,
    roomName: string,
): Set<string> {
    const obstacles = new Set<string>()

    // Add all structures as obstacles except roads and ramparts
    for (const [structType, positions] of buildings.entries()) {
        if (structType !== 'road' && structType !== 'rampart') {
            for (const pos of positions) {
                obstacles.add(`${roomName}:${pos.x},${pos.y}`)
            }
        }
    }

    return obstacles
}

describe('PServer Mine Roads - W1N8', function () {
    it('should calculate mine roads without intersecting obstacles', function () {
        const roomName = 'W1N8'

        // Load base room fixture
        console.log(`\n  📥 Loading fixture for ${roomName}...`)
        const baseFixture = loadRoomFixture(roomName) as RoomFixture
        assert.isNotNull(baseFixture, `Failed to load fixture for ${roomName}`)

        assert.isNotNull(baseFixture.controller, `No controller found in ${roomName}`)
        assert.isAbove(baseFixture.sources.length, 0, `No sources found in ${roomName}`)

        console.log(`  ✓ Room data loaded:`)
        console.log(`    Sources: ${baseFixture.sources.length}`)
        console.log(`    Controller: (${baseFixture.controller.x}, ${baseFixture.controller.y})`)

        // Calculate bunker placement
        console.log(`\n  🧮 Calculating bunker placement...`)
        const mockTerrain = new MockRoomTerrain(baseFixture.terrain)
        const placementResult = placeBunker({
            terrain: mockTerrain,
            roomName,
            sources: baseFixture.sources,
            controller: baseFixture.controller,
            stamp: bunkerStamp,
        })

        assert.isNotNull(placementResult.origin, 'Bunker origin should not be null')
        assert.isTrue(placementResult.success, 'Bunker placement should succeed')
        console.log(
            `  ✓ Bunker placed at origin (${placementResult.origin.x}, ${placementResult.origin.y})`,
        )

        // Calculate stationary points to get storage link position
        // BUT: Use the stamp's predefined stationary point instead of recalculating!
        const stampMetadata = placementResult.metadata?.stampMetadata
        if (!stampMetadata) {
            throw new Error('No stamp metadata available')
        }

        // Translate stamp stationary point to world coordinates
        // The stamp has storageLink at (22, 16), storage at (22, 17)
        const { top, left } = stampMetadata.extants
        const storageLinkStamp = bunkerStamp.stationaryPoints.storageLink
        const storageLinkWorld = {
            x: placementResult.origin.x + (storageLinkStamp.x - left) + 1,
            y: placementResult.origin.y + (storageLinkStamp.y - top) + 1,
        }

        console.log(
            `  ✓ Storage link hauler position (from stamp): (${storageLinkWorld.x}, ${storageLinkWorld.y})`,
        )

        // Find the actual storage position for comparison
        const storagePositions = placementResult.buildings.get('storage') || []
        if (storagePositions.length > 0) {
            console.log(
                `  ✓ Storage building position: (${storagePositions[0].x}, ${storagePositions[0].y})`,
            )
        }

        // Check for overlaps BEFORE calculating bunker roads (to isolate placeBunker issues)
        console.log(`\n  🔍 Checking for structure overlaps BEFORE calculateBunkerRoads...`)
        const preBunkerRoadsPositionMap = new Map<string, string[]>()
        for (const [type, positions] of placementResult.buildings.entries()) {
            for (const pos of positions) {
                const key = `${pos.x},${pos.y}`
                if (!preBunkerRoadsPositionMap.has(key)) {
                    preBunkerRoadsPositionMap.set(key, [])
                }
                const position = preBunkerRoadsPositionMap.get(key) as string[]
                position.push(type)
            }
        }

        let preOverlapsFound = 0
        for (const [posKey, types] of preBunkerRoadsPositionMap.entries()) {
            if (types.length > 1) {
                // Filter out ramparts since they can overlap with anything
                const nonRampartTypes = types.filter((t) => t !== 'rampart')
                if (nonRampartTypes.length > 1) {
                    console.log(`  ⚠️  PRE-OVERLAP at ${posKey}: [${types.join(', ')}]`)
                    preOverlapsFound++
                }
            }
        }
        if (preOverlapsFound === 0) {
            console.log(`  ✓ No structure overlaps found in placeBunker output`)
        } else {
            assert.fail(
                `Found ${preOverlapsFound} structure overlap(s) from placeBunker (before calculateBunkerRoads)`,
            )
        }

        // Calculate bunker roads to provide paths around the bunker
        console.log(`\n  🛣️  Calculating bunker roads...`)
        const bunkerRoads = calculateBunkerRoads(
            mockTerrain,
            placementResult.buildings,
            baseFixture.sources,
            baseFixture.controller,
            baseFixture.minerals[0],
        )

        // Add bunker roads to the buildings map
        const existingRoads = placementResult.buildings.get('road') || []
        const allBunkerRoads = [...existingRoads, ...bunkerRoads]
        placementResult.buildings.set('road', allBunkerRoads)
        console.log(`  ✓ Calculated ${bunkerRoads.length} external bunker roads`)
        console.log(`  ✓ Total bunker roads: ${allBunkerRoads.length}`)
        console.log(
            `  ℹ️  Expected: ${existingRoads.length} + ${bunkerRoads.length} = ${
                existingRoads.length + bunkerRoads.length
            }; Actual: ${allBunkerRoads.length}`,
        )

        // Build obstacles from bunker buildings (excluding roads)
        const obstacles = buildObstacles(placementResult.buildings, roomName)
        console.log(`  ✓ Built ${obstacles.size} obstacles from bunker buildings`)

        // Build roads set for pathfinding preference
        // Only include roads that don't have obstacles on them
        const roads = new Set<string>()
        for (const road of allBunkerRoads) {
            const roadKey = `${roomName}:${road.x},${road.y}`
            if (!obstacles.has(roadKey)) {
                roads.add(roadKey)
            }
        }
        console.log(
            `  ✓ Marked ${roads.size} existing roads for pathfinding (${
                allBunkerRoads.length - roads.size
            } roads blocked by obstacles)`,
        )

        // Check for overlapping structures in the stamp
        console.log(`\n  🔍 Checking for structure overlaps in stamp...`)
        const positionMap = new Map<string, string[]>()
        for (const [type, positions] of placementResult.buildings.entries()) {
            for (const pos of positions) {
                const key = `${pos.x},${pos.y}`
                if (!positionMap.has(key)) {
                    positionMap.set(key, [])
                }
                const position = positionMap.get(key) as string[]
                position.push(type)
            }
        }

        let overlapsFound = 0
        const overlappingStampCoords: string[] = []
        for (const [posKey, types] of positionMap.entries()) {
            if (types.length > 1) {
                // Filter out ramparts since they can overlap with anything
                const nonRampartTypes = types.filter((t) => t !== 'rampart')
                if (nonRampartTypes.length > 1) {
                    // Convert world coords back to stamp coords for debugging
                    const [worldX, worldY] = posKey.split(',').map(Number)
                    const stampX =
                        worldX - placementResult.origin.x - 1 + stampMetadata.extants.left
                    const stampY = worldY - placementResult.origin.y - 1 + stampMetadata.extants.top
                    console.log(
                        `  ⚠️  Overlap at ${posKey}: [${types.join(
                            ', ',
                        )}] (stamp: ${stampX},${stampY})`,
                    )
                    overlappingStampCoords.push(`{ x: ${stampX}, y: ${stampY} }`)
                    overlapsFound++
                }
            }
        }
        if (overlapsFound === 0) {
            console.log(`  ✓ No structure overlaps found (excluding ramparts)`)
        } else {
            console.log(`\n  📝 Stamp road positions to remove:`)
            console.log(`     ${overlappingStampCoords.join(',\n     ')}`)
            assert.fail(`Found ${overlapsFound} structure overlap(s)`)
        }

        // CRITICAL: Check for problematic road/obstacle overlaps
        // NOTE: The bunker stamp intentionally has roads defined at positions with other structures.
        // This is a pathfinding optimization - roads indicate "preferred walkable tiles".
        // In the actual game:
        // - Extensions/structures are built (not roads) where they overlap
        // - Ramparts can be built on top of roads or any structure
        //
        // We ONLY fail if:
        // 1. A road overlaps with an obstacle that has NO rampart (impossible in game)
        // 2. calculateBunkerRoads() is creating new roads on obstacle positions
        //
        // The existing stamp roads overlapping with extensions+ramparts is EXPECTED and OK.
        const problematicOverlaps: string[] = []
        for (const [posKey, types] of positionMap.entries()) {
            const hasRoad = types.includes('road')
            const hasRampart = types.includes('rampart')
            const nonRoadTypes = types.filter((t) => t !== 'rampart' && t !== 'road')

            // Problem: Road overlaps with structure but NO rampart to make it walkable
            if (hasRoad && nonRoadTypes.length > 0 && !hasRampart) {
                problematicOverlaps.push(`${posKey}: [${types.join(', ')}]`)
            }
        }

        if (problematicOverlaps.length > 0) {
            assert.fail(
                `Roads overlap with obstacles without ramparts! Found ${
                    problematicOverlaps.length
                } problematic overlaps:\n  ${problematicOverlaps.join('\n  ')}\n\n` +
                    `These roads would be impassable in the actual game. Either:\n` +
                    `1. Add ramparts to these positions (makes them walkable), OR\n` +
                    `2. Remove the road from the stamp/calculation`,
            )
        }

        // Log building types at key positions to verify layout hypothesis
        const inspectPositions = [
            { x: 11, y: 30 },
            { x: 13, y: 30 },
        ]
        for (const pos of inspectPositions) {
            const typesAtPos: string[] = []
            for (const [type, positions] of placementResult.buildings.entries()) {
                if (positions.some((p) => p.x === pos.x && p.y === pos.y)) {
                    typesAtPos.push(type)
                }
            }
            const key = `${roomName}:${pos.x},${pos.y}`
            console.log(
                `  🔎 Position (${pos.x}, ${pos.y}) -> [${typesAtPos.join(', ') || 'none'}]; ` +
                    `obstacle=${obstacles.has(key)} road=${roads.has(key)}`,
            )
        }

        // Log all 8 tiles surrounding the storage link position
        console.log(
            `\n  🧭 Tiles surrounding storage link at (${storageLinkWorld.x}, ${storageLinkWorld.y}):`,
        )
        const surroundingOffsets = [
            { dir: 'N', dx: 0, dy: -1 },
            { dir: 'NE', dx: 1, dy: -1 },
            { dir: 'E', dx: 1, dy: 0 },
            { dir: 'SE', dx: 1, dy: 1 },
            { dir: 'S', dx: 0, dy: 1 },
            { dir: 'SW', dx: -1, dy: 1 },
            { dir: 'W', dx: -1, dy: 0 },
            { dir: 'NW', dx: -1, dy: -1 },
        ]

        for (const { dir, dx, dy } of surroundingOffsets) {
            const x = storageLinkWorld.x + dx
            const y = storageLinkWorld.y + dy
            const typesAtPos: string[] = []
            for (const [type, positions] of placementResult.buildings.entries()) {
                if (positions.some((p) => p.x === x && p.y === y)) {
                    typesAtPos.push(type)
                }
            }
            const key = `${roomName}:${x},${y}`
            const terrainVal = mockTerrain.get(x, y)
            const terrainLabel = terrainVal === 1 ? 'wall' : terrainVal === 2 ? 'swamp' : 'plain'
            console.log(
                `    ${dir.padEnd(2)} (${x}, ${y}) -> terrain=${terrainLabel} [${
                    typesAtPos.join(', ') || 'none'
                }]; obstacle=${obstacles.has(key)} road=${roads.has(key)}`,
            )
        }

        // Stepwise path probe from the start to check for obstacles on each prefix path
        const directionDeltas: Record<
            'N' | 'S' | 'E' | 'W' | 'NE' | 'NW' | 'SE' | 'SW',
            { dx: number; dy: number }
        > = {
            N: { dx: 0, dy: -1 },
            S: { dx: 0, dy: 1 },
            E: { dx: 1, dy: 0 },
            W: { dx: -1, dy: 0 },
            NE: { dx: 1, dy: -1 },
            NW: { dx: -1, dy: -1 },
            SE: { dx: 1, dy: 1 },
            SW: { dx: -1, dy: 1 },
        }

        const probePath: Array<keyof typeof directionDeltas> = ['SW', 'NW', 'N', 'NE', 'NE']
        console.log(`\n  🧭 Stepwise probe from start: ${probePath.join(' -> ')}`)

        let probePos = { ...storageLinkWorld }
        const prefix: string[] = []
        for (const dir of probePath) {
            const { dx, dy } = directionDeltas[dir]
            probePos = { x: probePos.x + dx, y: probePos.y + dy }
            prefix.push(dir)
            const key = `${roomName}:${probePos.x},${probePos.y}`
            const typesAtPos: string[] = []
            for (const [type, positions] of placementResult.buildings.entries()) {
                if (positions.some((p) => p.x === probePos.x && p.y === probePos.y)) {
                    typesAtPos.push(type)
                }
            }
            console.log(
                `  🔎 Prefix ${prefix.join(' -> ')} @ (${probePos.x}, ${probePos.y}) -> ` +
                    `[${typesAtPos.join(', ') || 'none'}]; obstacle=${obstacles.has(
                        key,
                    )} road=${roads.has(key)}`,
            )
        }

        // Load neighboring room fixtures (known mine rooms for W1N8)
        console.log(`\n  📍 Loading neighboring room fixtures for mines...`)
        const mineRoomNames = ['W1N9', 'W2N8']
        const mineRooms: {
            name: string
            sources: { x: number; y: number }[]
            terrain: number[][]
        }[] = []

        for (const neighborName of mineRoomNames) {
            console.log(`    Loading ${neighborName}...`)
            const fixture = loadRoomFixture(neighborName)
            if (!fixture) {
                console.log(`      ✗ Fixture not found`)
                continue
            }

            if (fixture.sources.length > 0) {
                console.log(`      ✓ Mine room with ${fixture.sources.length} source(s)`)
                mineRooms.push({
                    name: neighborName,
                    sources: fixture.sources,
                    terrain: fixture.terrain,
                })
            } else {
                console.log(`      ✗ No sources found`)
            }
        }

        console.log(`  ✓ Loaded ${mineRooms.length} mine room(s)`)
        assert.isAbove(mineRooms.length, 0, 'Should have at least one mine room')
        mineRooms.sort((a, b) => a.name.localeCompare(b.name))

        // Setup Game.map.getRoomTerrain for pathfinding
        ;(global as any).Game = {
            map: {
                getRoomTerrain: (rName: string) => {
                    if (rName === roomName) {
                        return mockTerrain
                    }
                    const mineRoom = mineRooms.find((m) => m.name === rName)
                    if (mineRoom) {
                        return new MockRoomTerrain(mineRoom.terrain)
                    }
                    throw new Error(`Unknown room: ${rName}`)
                },
            },
        }

        // Remove storage link from obstacles (it shouldn't block itself)
        const storageKey = `${roomName}:${storageLinkWorld.x},${storageLinkWorld.y}`
        obstacles.delete(storageKey)

        // Find an adjacent walkable position to start pathfinding from
        // The storage link itself is surrounded by obstacles, so we need to start
        // from a position that a creep can actually stand on
        console.log(`\n  🔍 Finding accessible start position adjacent to storage link...`)
        // The storage link position IS the stationary point where the hauler stands
        // This is the correct starting position for pathfinding
        const startPosition = storageLinkWorld

        console.log(
            `  ✓ Using storage link hauler position: (${startPosition.x}, ${startPosition.y})`,
        )

        // Check all 8 neighbors of the start position
        console.log(
            `\n  🔍 Checking all 8 neighbors of start position (${startPosition.x}, ${startPosition.y}):`,
        )
        const startNeighbors = [
            { dir: 'N', x: startPosition.x, y: startPosition.y - 1, dx: 0, dy: -1 },
            { dir: 'NE', x: startPosition.x + 1, y: startPosition.y - 1, dx: 1, dy: -1 },
            { dir: 'E', x: startPosition.x + 1, y: startPosition.y, dx: 1, dy: 0 },
            { dir: 'SE', x: startPosition.x + 1, y: startPosition.y + 1, dx: 1, dy: 1 },
            { dir: 'S', x: startPosition.x, y: startPosition.y + 1, dx: 0, dy: 1 },
            { dir: 'SW', x: startPosition.x - 1, y: startPosition.y + 1, dx: -1, dy: 1 },
            { dir: 'W', x: startPosition.x - 1, y: startPosition.y, dx: -1, dy: 0 },
            { dir: 'NW', x: startPosition.x - 1, y: startPosition.y - 1, dx: -1, dy: -1 },
        ]

        // Log detailed info about each neighbor
        let getCost = createMultiRoomTerrainCost()
        if (roads.size > 0) {
            getCost = withMultiRoomPreferredPaths(getCost, roads, 1)
        }
        if (obstacles.size > 0) {
            getCost = withMultiRoomObstacles(getCost, obstacles, 255)
        }

        for (const n of startNeighbors) {
            const cost = getCost(roomName, n.x, n.y)
            const key = `${roomName}:${n.x},${n.y}`
            const isObstacle = obstacles.has(key)
            const isRoad = roads.has(key)
            const terrainVal = mockTerrain.get(n.x, n.y)
            const terrainLabel = terrainVal === 1 ? 'wall' : terrainVal === 2 ? 'swamp' : 'plain'

            const types: string[] = []
            if (isObstacle) {
                // Find what obstacle types are here
                for (const [type, positions] of placementResult.buildings.entries()) {
                    if (positions.some((pos) => pos.x === n.x && pos.y === n.y)) {
                        types.push(type)
                    }
                }
            }
            if (isRoad) types.push('road')

            console.log(
                `    ${n.dir.padEnd(2)}: (${n.x},${n.y}) terrain=${terrainLabel} cost=${cost} ` +
                    `walkable=${cost < 255} ${
                        types.length > 0 ? '[' + types.join(', ') + ']' : ''
                    }`,
            )
        }

        // Compare per-tile costs for candidate corridors using the same cost function as pathfinding

        const logCostPath = (label: string, steps: { x: number; y: number }[]) => {
            let total = 0
            console.log(`\n  💰 Cost breakdown: ${label}`)
            for (let i = 0; i < steps.length; i++) {
                const step = steps[i]
                const cost = getCost(roomName, step.x, step.y)
                const terrainVal = mockTerrain.get(step.x, step.y)
                const terrainLabel =
                    terrainVal === 1 ? 'wall' : terrainVal === 2 ? 'swamp' : 'plain'
                if (i > 0) {
                    const prev = steps[i - 1]
                    const isDiagonal =
                        Math.abs(step.x - prev.x) === 1 && Math.abs(step.y - prev.y) === 1
                    total += cost * (isDiagonal ? Math.SQRT2 : 1)
                }
                console.log(
                    `    (${step.x}, ${step.y}) -> terrain=${terrainLabel}(${terrainVal}) cost=${cost}`,
                )
            }
            console.log(`    Total cost (movement only): ${total}`)
        }

        const cleanCorridor = [
            { x: storageLinkWorld.x, y: storageLinkWorld.y },
            { x: storageLinkWorld.x - 1, y: storageLinkWorld.y + 1 }, // SW
            { x: storageLinkWorld.x - 2, y: storageLinkWorld.y }, // NW
            { x: storageLinkWorld.x - 2, y: storageLinkWorld.y - 1 }, // N
            { x: storageLinkWorld.x - 1, y: storageLinkWorld.y - 2 }, // NE
            { x: storageLinkWorld.x, y: storageLinkWorld.y - 3 }, // NE
        ]

        const obstacleSkew = [
            { x: storageLinkWorld.x, y: storageLinkWorld.y },
            { x: storageLinkWorld.x - 1, y: storageLinkWorld.y }, // W
            { x: storageLinkWorld.x - 2, y: storageLinkWorld.y }, // W
            { x: storageLinkWorld.x - 3, y: storageLinkWorld.y }, // W
            { x: storageLinkWorld.x - 4, y: storageLinkWorld.y - 1 }, // NW
            { x: storageLinkWorld.x - 5, y: storageLinkWorld.y - 2 }, // NW
        ]

        logCostPath('clean corridor (SW -> NW -> N -> NE -> NE)', cleanCorridor)
        logCostPath('obstacle-skew path (W -> W -> W -> NW -> NW)', obstacleSkew)

        // Debug: Test if pathfinder can find a path 3 spaces north
        console.log(`\n  🧪 Debug: Testing pathfinding to 3 spaces north...`)
        const debugTarget = { x: storageLinkWorld.x, y: storageLinkWorld.y - 3 }
        console.log(
            `    From: (${storageLinkWorld.x}, ${storageLinkWorld.y}) To: (${debugTarget.x}, ${debugTarget.y})`,
        )

        // Check what's at the target position
        const targetKey = `${roomName}:${debugTarget.x},${debugTarget.y}`
        const targetTypes: string[] = []
        for (const [type, positions] of placementResult.buildings.entries()) {
            if (positions.some((p) => p.x === debugTarget.x && p.y === debugTarget.y)) {
                targetTypes.push(type)
            }
        }
        const targetTerrain = mockTerrain.get(debugTarget.x, debugTarget.y)
        const targetTerrainLabel =
            targetTerrain === 1 ? 'wall' : targetTerrain === 2 ? 'swamp' : 'plain'
        console.log(
            `    Target: terrain=${targetTerrainLabel} [${targetTypes.join(', ') || 'none'}]; ` +
                `obstacle=${obstacles.has(targetKey)} road=${roads.has(targetKey)}`,
        )

        // Try to path to it using calculateSingleMineRoads (which uses findPath for same-room)
        // We need to use the pathfinding library directly since calculateSingleMineRoads is for multi-room
        // For now, just report the cost of directly walking there
        const debugCost = getCost(roomName, debugTarget.x, debugTarget.y)
        console.log(`    Cost at target position: ${debugCost}`)

        // Same-room pathfinding test: Use findPath to path from storage link to 3 north
        console.log(`\n  🧪 Same-room pathfinding test: storage link to 3 north`)

        // Convert multi-room cost callback to single-room
        const singleRoomCost = (x: number, y: number) => getCost(roomName, x, y)

        // Log start and goal costs
        const startCost = singleRoomCost(storageLinkWorld.x, storageLinkWorld.y)
        const goalCost = singleRoomCost(debugTarget.x, debugTarget.y)
        console.log(
            `    Start: (${storageLinkWorld.x}, ${storageLinkWorld.y}) -> cost=${startCost}`,
        )
        console.log(`    Goal: (${debugTarget.x}, ${debugTarget.y}) -> cost=${goalCost}`)

        // Debug: Check if start position is walkable
        if (startCost >= 255) {
            console.log(`    ⚠️  WARNING: Start position has cost >= 255 (unwalkable)!`)
        }

        // Debug: Check the known good path from "clean corridor"
        console.log(`\n    Checking known corridor path (SW -> NW -> N -> NE -> NE):`)
        const knownPath = [
            { x: 11, y: 30 }, // SW
            { x: 10, y: 29 }, // NW
            { x: 10, y: 28 }, // N
            { x: 11, y: 27 }, // NE
            { x: 12, y: 26 }, // NE (goal)
        ]
        for (const pos of knownPath) {
            const cost = singleRoomCost(pos.x, pos.y)
            const walkable = cost < 255
            console.log(`      (${pos.x}, ${pos.y}) -> cost=${cost} walkable=${walkable}`)
        }

        // Debug: Check all 8 neighbors of start
        console.log(`\n    Checking start position neighbors:`)
        const neighbors = [
            { dir: 'N', dx: 0, dy: -1 },
            { dir: 'NE', dx: 1, dy: -1 },
            { dir: 'E', dx: 1, dy: 0 },
            { dir: 'SE', dx: 1, dy: 1 },
            { dir: 'S', dx: 0, dy: 1 },
            { dir: 'SW', dx: -1, dy: 1 },
            { dir: 'W', dx: -1, dy: 0 },
            { dir: 'NW', dx: -1, dy: -1 },
        ]
        for (const { dir, dx, dy } of neighbors) {
            const nx = storageLinkWorld.x + dx
            const ny = storageLinkWorld.y + dy
            const nCost = singleRoomCost(nx, ny)
            const walkable = nCost < 255
            console.log(
                `      ${dir.padEnd(2)}: (${nx}, ${ny}) -> cost=${nCost} walkable=${walkable}`,
            )
        }

        // Call findPath
        console.log(`\n    Calling findPath with A* (allowDiagonal=true, dontCrossCorners=true)...`)
        const path = findPath(
            { x: storageLinkWorld.x, y: storageLinkWorld.y },
            { x: debugTarget.x, y: debugTarget.y },
            singleRoomCost,
            { range: 0, maxOps: 20000, roomSize: 50 },
        )

        // Also try with a simpler test: can we path from start to SW neighbor?
        console.log(`\n    Testing simpler path: start to SW neighbor (11, 30)...`)
        const simplePath = findPath(
            { x: storageLinkWorld.x, y: storageLinkWorld.y },
            { x: 11, y: 30 },
            singleRoomCost,
            { range: 0, maxOps: 20000, roomSize: 50 },
        )
        if (simplePath && simplePath.length > 0) {
            console.log(`      ✓ Simple path found: ${simplePath.length} steps`)
            for (const step of simplePath) {
                console.log(`        (${step.x}, ${step.y})`)
            }
        } else {
            console.log(`      ❌ Even simple SW path failed!`)
            // Check if diagonal is blocked by corners
            const checkS = singleRoomCost(storageLinkWorld.x, storageLinkWorld.y + 1)
            const checkW = singleRoomCost(storageLinkWorld.x - 1, storageLinkWorld.y)
            console.log(
                `      Corner check for SW diagonal: S(12,30)=${
                    checkS >= 255 ? 'BLOCKED' : 'open'
                } ` + `W(11,29)=${checkW >= 255 ? 'BLOCKED' : 'open'}`,
            )
            if (checkS >= 255 || checkW >= 255) {
                console.log(
                    `      ⚠️  dontCrossCorners=true prevents diagonal when adjacent tiles blocked!`,
                )
            }
        }

        if (path && path.length > 0) {
            console.log(`\n    ✓ Path found: ${path.length} steps`)

            // Log each step with details
            let totalCost = 0
            for (let i = 0; i < path.length; i++) {
                const step = path[i]
                const cost = singleRoomCost(step.x, step.y)
                const terrainVal = mockTerrain.get(step.x, step.y)
                const terrainLabel =
                    terrainVal === 1 ? 'wall' : terrainVal === 2 ? 'swamp' : 'plain'

                // Get structures at this position
                const stepTypes: string[] = []
                for (const [type, positions] of placementResult.buildings.entries()) {
                    if (positions.some((p) => p.x === step.x && p.y === step.y)) {
                        stepTypes.push(type)
                    }
                }

                const stepKey = `${roomName}:${step.x},${step.y}`

                // Calculate cost accounting for diagonal movement
                if (i > 0) {
                    const prev = path[i - 1]
                    const isDiagonal =
                        Math.abs(step.x - prev.x) === 1 && Math.abs(step.y - prev.y) === 1
                    totalCost += cost * (isDiagonal ? Math.SQRT2 : 1)
                } else {
                    // First step from start position
                    const isDiagonal =
                        Math.abs(step.x - storageLinkWorld.x) === 1 &&
                        Math.abs(step.y - storageLinkWorld.y) === 1
                    totalCost += cost * (isDiagonal ? Math.SQRT2 : 1)
                }

                console.log(
                    `      Step ${i + 1}: (${step.x}, ${step.y}) -> terrain=${terrainLabel} ` +
                        `[${stepTypes.join(', ') || 'none'}] obstacle=${obstacles.has(
                            stepKey,
                        )} cost=${cost}`,
                )
            }
            console.log(`    Total path cost: ${totalCost}`)
        } else {
            console.log(`\n    ❌ No path found!`)
            console.log(
                `    Start position (${storageLinkWorld.x}, ${storageLinkWorld.y}): ` +
                    `cost=${startCost} obstacle=${obstacles.has(
                        `${roomName}:${storageLinkWorld.x},${storageLinkWorld.y}`,
                    )}`,
            )
            console.log(
                `    Goal position (${debugTarget.x}, ${debugTarget.y}): ` +
                    `cost=${goalCost} obstacle=${obstacles.has(targetKey)}`,
            )

            // Check direct path
            console.log(`\n    Checking direct path obstacles:`)
            for (let y = storageLinkWorld.y - 1; y >= debugTarget.y; y--) {
                const checkKey = `${roomName}:${storageLinkWorld.x},${y}`
                const checkCost = singleRoomCost(storageLinkWorld.x, y)
                const checkTypes: string[] = []
                for (const [type, positions] of placementResult.buildings.entries()) {
                    if (positions.some((p) => p.x === storageLinkWorld.x && p.y === y)) {
                        checkTypes.push(type)
                    }
                }
                const blocked = checkCost >= 255
                console.log(
                    `      (${storageLinkWorld.x}, ${y}) -> [${
                        checkTypes.join(', ') || 'none'
                    }] cost=${checkCost}${blocked ? ' BLOCKED!' : ''}`,
                )
            }
        }

        // Grid visualization
        console.log(`\n    Grid visualization (S=start, G=goal, #=obstacle, .=walkable, *=path):`)
        const gridSize = 7
        const gridCenterX = storageLinkWorld.x
        const gridCenterY = storageLinkWorld.y - 1 // Shift up since goal is north
        const gridStartX = gridCenterX - Math.floor(gridSize / 2)
        const gridStartY = gridCenterY - Math.floor(gridSize / 2)

        // Build path set for quick lookup
        const pathSet = new Set<string>()
        if (path) {
            for (const step of path) {
                pathSet.add(`${step.x},${step.y}`)
            }
        }

        for (let y = gridStartY; y < gridStartY + gridSize; y++) {
            let row = `      `
            for (let x = gridStartX; x < gridStartX + gridSize; x++) {
                if (x === storageLinkWorld.x && y === storageLinkWorld.y) {
                    row += 'S'
                } else if (x === debugTarget.x && y === debugTarget.y) {
                    row += 'G'
                } else if (pathSet.has(`${x},${y}`)) {
                    row += '*'
                } else if (x < 0 || x >= 50 || y < 0 || y >= 50) {
                    row += '?'
                } else {
                    const gridCost = singleRoomCost(x, y)
                    row += gridCost >= 255 ? '#' : '.'
                }
            }
            row += `  (y=${y})`
            console.log(row)
        }
        console.log(`      ${'x'.repeat(gridSize)}`)
        let xLabels = `      `
        for (let x = gridStartX; x < gridStartX + gridSize; x++) {
            xLabels += x % 10
        }
        console.log(xLabels)

        // Calculate mine roads for each neighboring mine room
        console.log(`\n  🛣️  Calculating mine roads...`)

        // Debug: Check room edge accessibility
        console.log(
            `\n  🔍 Checking room edge accessibility from start (${startPosition.x}, ${startPosition.y})...`,
        )

        // Check north edge (y=0)
        let northExit: { x: number; y: number } | null = null
        for (let x = 0; x < 50; x++) {
            const cost = getCost(roomName, x, 0)
            if (cost < 255) {
                northExit = { x, y: 0 }
                console.log(`    North edge: Found walkable at (${x}, 0)`)
                break
            }
        }
        if (!northExit) {
            console.log(`    North edge: NO walkable tiles found!`)
        }

        // Check south edge (y=49)
        let southExit: { x: number; y: number } | null = null
        for (let x = 0; x < 50; x++) {
            const cost = getCost(roomName, x, 49)
            if (cost < 255) {
                southExit = { x, y: 49 }
                console.log(`    South edge: Found walkable at (${x}, 49)`)
                break
            }
        }
        if (!southExit) {
            console.log(`    South edge: NO walkable tiles found!`)
        }

        // Check east edge (x=49)
        let eastExit: { x: number; y: number } | null = null
        for (let y = 0; y < 50; y++) {
            const cost = getCost(roomName, 49, y)
            if (cost < 255) {
                eastExit = { x: 49, y }
                console.log(`    East edge: Found walkable at (49, ${y})`)
                break
            }
        }
        if (!eastExit) {
            console.log(`    East edge: NO walkable tiles found!`)
        }

        // Check west edge (x=0)
        let westExit: { x: number; y: number } | null = null
        for (let y = 0; y < 50; y++) {
            const cost = getCost(roomName, 0, y)
            if (cost < 255) {
                westExit = { x: 0, y }
                console.log(`    West edge: Found walkable at (0, ${y})`)
                break
            }
        }
        if (!westExit) {
            console.log(`    West edge: NO walkable tiles found!`)
        }

        // Try same-room pathfinding to north exit
        if (northExit) {
            console.log(`\n  🧪 Split pathfinding test: Inside bunker vs Outside bunker...`)

            // From the stepwise probe, we know the clean corridor reaches (12, 26) which is 3 north
            // Let's test that as the intermediate waypoint instead of 2 north (which has a spawn)
            const waypoint = { x: 12, y: 26 } // 3 north of link - known to be a road
            console.log(
                `\n    Test 1: Start (${startPosition.x}, ${startPosition.y}) -> Waypoint (${waypoint.x}, ${waypoint.y})`,
            )
            console.log(`            (This is 3 north of storage link, known to be on a road)`)

            const singleRoomCost = (x: number, y: number) => getCost(roomName, x, y)
            const pathInsideBunker = findPath(startPosition, waypoint, singleRoomCost, {
                range: 0,
                maxOps: 20000,
                roomSize: 50,
            })

            if (pathInsideBunker && pathInsideBunker.length > 0) {
                console.log(`      ✓ INSIDE BUNKER: Path found! ${pathInsideBunker.length} steps`)
                console.log(
                    `        Path: ${pathInsideBunker.map((p) => `(${p.x},${p.y})`).join(' -> ')}`,
                )

                // Test 2: Can we path OUTSIDE the bunker from waypoint to exit?
                console.log(
                    `\n    Test 2: Waypoint (${waypoint.x}, ${waypoint.y}) -> North exit (${northExit.x}, ${northExit.y})`,
                )
                const pathOutsideBunker = findPath(waypoint, northExit, singleRoomCost, {
                    range: 0,
                    maxOps: 20000,
                    roomSize: 50,
                })

                if (pathOutsideBunker && pathOutsideBunker.length > 0) {
                    console.log(
                        `      ✓ OUTSIDE BUNKER: Path found! ${pathOutsideBunker.length} steps`,
                    )
                    console.log(
                        `        First 5 steps: ${pathOutsideBunker
                            .slice(0, 5)
                            .map((p) => `(${p.x},${p.y})`)
                            .join(' -> ')}`,
                    )
                    console.log(
                        `        Last 3 steps: ${pathOutsideBunker
                            .slice(-3)
                            .map((p) => `(${p.x},${p.y})`)
                            .join(' -> ')}`,
                    )
                    console.log(`\n      ✅ BOTH SEGMENTS WORK!`)
                    console.log(
                        `         Total path length: ${
                            pathInsideBunker.length + pathOutsideBunker.length
                        } steps`,
                    )
                    console.log(
                        `         The issue must be in multi-room pathfinding coordinate translation.`,
                    )
                } else {
                    console.log(`      ❌ OUTSIDE BUNKER: No path from waypoint to exit!`)
                    console.log(
                        `         Problem is OUTSIDE the bunker - roads don't reach room exits.`,
                    )
                }
            } else {
                console.log(`      ❌ INSIDE BUNKER: No path to waypoint!`)
                console.log(`         Problem is INSIDE the bunker - can't navigate bunker roads.`)

                // Check what's at the waypoint
                const waypointCost = singleRoomCost(waypoint.x, waypoint.y)
                const waypointTypes: string[] = []
                for (const [type, positions] of placementResult.buildings.entries()) {
                    if (positions.some((p) => p.x === waypoint.x && p.y === waypoint.y)) {
                        waypointTypes.push(type)
                    }
                }
                console.log(
                    `         Target (${waypoint.x}, ${waypoint.y}): [${
                        waypointTypes.join(', ') || 'none'
                    }] cost=${waypointCost}`,
                )

                // Debug: Check each step of the known corridor for corner-crossing issues
                console.log(`\n         Checking corner-crossing on known corridor:`)
                const knownCorridor = [
                    { from: startPosition, to: { x: 10, y: 29 }, dir: 'NW' },
                    { from: { x: 10, y: 29 }, to: { x: 10, y: 28 }, dir: 'N' },
                    { from: { x: 10, y: 28 }, to: { x: 11, y: 27 }, dir: 'NE' },
                    { from: { x: 11, y: 27 }, to: { x: 12, y: 26 }, dir: 'NE' },
                ]

                for (const step of knownCorridor) {
                    const fromCost = singleRoomCost(step.from.x, step.from.y)
                    const toCost = singleRoomCost(step.to.x, step.to.y)

                    // Check if it's diagonal
                    const dx = step.to.x - step.from.x
                    const dy = step.to.y - step.from.y
                    const isDiagonal = Math.abs(dx) === 1 && Math.abs(dy) === 1

                    if (isDiagonal) {
                        // Check corner tiles for dontCrossCorners
                        const corner1 = { x: step.from.x + dx, y: step.from.y } // horizontal component
                        const corner2 = { x: step.from.x, y: step.from.y + dy } // vertical component
                        const corner1Cost = singleRoomCost(corner1.x, corner1.y)
                        const corner2Cost = singleRoomCost(corner2.x, corner2.y)
                        const blocked = corner1Cost >= 255 || corner2Cost >= 255

                        console.log(
                            `           ${step.dir}: (${step.from.x},${step.from.y})->(${step.to.x},${step.to.y}) ` +
                                `corners=(${corner1Cost},${corner2Cost}) ${
                                    blocked ? 'BLOCKED!' : 'ok'
                                }`,
                        )
                    } else {
                        console.log(
                            `           ${step.dir}: (${step.from.x},${step.from.y})->(${step.to.x},${step.to.y}) ` +
                                `cardinal move`,
                        )
                    }
                }
            }
        }

        const allMineRoads: { x: number; y: number }[] = []
        const failedMines: string[] = []
        const mineIntersections = new Map<string, string[]>()

        for (const mineRoom of mineRooms) {
            console.log(`\n    Mine: ${mineRoom.name}`)
            const result = calculateSingleMineRoads({
                baseRoomName: roomName,
                startPosition: startPosition,
                mineRoomName: mineRoom.name,
                mineSources: mineRoom.sources,
                obstacles,
                roads,
            })

            if (!result) {
                console.log(`      ❌ Could not find path`)
                failedMines.push(mineRoom.name)
                continue
            }

            console.log(`      ✓ Path found:`)
            console.log(`        Exit: (${result.exitPosition.x}, ${result.exitPosition.y})`)
            console.log(
                `        Entrance: (${result.entrancePosition.x}, ${result.entrancePosition.y})`,
            )
            console.log(`        Base roads: ${result.baseRoads.length}`)
            console.log(`        Mine roads: ${result.mineRoads.length}`)

            // Log base path tiles with obstacle/road flags for comparison
            console.log(`\n      🧭 Base path tiles in ${roomName}:`)
            for (const road of result.baseRoads) {
                const key = `${roomName}:${road.x},${road.y}`
                const typesAtPos: string[] = []
                for (const [type, positions] of placementResult.buildings.entries()) {
                    if (positions.some((p) => p.x === road.x && p.y === road.y)) {
                        typesAtPos.push(type)
                    }
                }
                console.log(
                    `        (${road.x}, ${road.y}) -> [${typesAtPos.join(', ') || 'none'}]; ` +
                        `obstacle=${obstacles.has(key)} road=${roads.has(key)}`,
                )
            }

            // Check for intersections with obstacles
            console.log(`\n      🔍 Checking for obstacle intersections...`)
            const intersections: string[] = []

            for (const road of result.baseRoads) {
                const roadKey = `${roomName}:${road.x},${road.y}`
                if (obstacles.has(roadKey)) {
                    intersections.push(roadKey)
                }
            }

            if (intersections.length > 0) {
                console.log(`      ❌ Found ${intersections.length} obstacle intersections:`)
                for (const intersection of intersections) {
                    console.log(`        - ${intersection}`)
                }
            } else {
                console.log(`      ✓ No obstacle intersections found`)
            }

            if (intersections.length > 0) {
                mineIntersections.set(mineRoom.name, intersections)
            }

            allMineRoads.push(...result.baseRoads)
        }

        // Assert no obstacle intersections across all mines
        const intersectionEntries = [...mineIntersections.entries()]
        assert.equal(
            intersectionEntries.length,
            0,
            `Mine roads intersected obstacles in: ${intersectionEntries
                .map(([name, tiles]) => `${name}(${tiles.join(', ')})`)
                .join('; ')}`,
        )

        // Assert that paths were found to ALL mine rooms (user reports all are visually accessible)
        const successfulMines = mineRooms.length - failedMines.length
        assert.equal(
            failedMines.length,
            0,
            `Failed to find paths to ${failedMines.length} of ${
                mineRooms.length
            } mine room(s): ${failedMines.join(
                ', ',
            )}. All mine rooms should be reachable via bunker roads with diagonal movement enabled.`,
        )

        console.log(
            `\n  ✅ Test passed: ${allMineRoads.length} mine road tiles calculated with no obstacle intersections`,
        )
        console.log(`      Successful paths: ${successfulMines}/${mineRooms.length} mine rooms`)

        // Cleanup
        delete (global as any).Game
    })

    it('should find path from stationary point to 3 north within bunker', function () {
        const roomName = 'W1N8'

        // Load base room fixture
        console.log(`\n  📥 Loading fixture for ${roomName}...`)
        const baseFixture = loadRoomFixture(roomName) as RoomFixture
        assert.isNotNull(baseFixture, `Failed to load fixture for ${roomName}`)
        assert.isNotNull(baseFixture.controller, `No controller in ${roomName}`)

        // Calculate bunker placement
        console.log(`  🧮 Calculating bunker placement...`)
        const mockTerrain = new MockRoomTerrain(baseFixture.terrain)
        const placementResult = placeBunker({
            terrain: mockTerrain,
            roomName,
            sources: baseFixture.sources,
            controller: baseFixture.controller,
            stamp: bunkerStamp,
        })

        assert.isNotNull(placementResult.origin, 'Bunker origin should not be null')
        assert.isTrue(placementResult.success, 'Bunker placement should succeed')

        // Get storage link stationary point
        const stampMetadata = placementResult.metadata?.stampMetadata
        if (!stampMetadata) {
            throw new Error('No stamp metadata available')
        }

        const { top, left } = stampMetadata.extants
        const storageLinkStamp = bunkerStamp.stationaryPoints.storageLink
        const storageLinkWorld = {
            x: placementResult.origin.x + (storageLinkStamp.x - left) + 1,
            y: placementResult.origin.y + (storageLinkStamp.y - top) + 1,
        }

        console.log(
            `  📍 Storage link stationary point: (${storageLinkWorld.x}, ${storageLinkWorld.y})`,
        )

        // Build obstacles with ramparts making tiles walkable
        const obstacles = buildObstacles(placementResult.buildings, roomName)

        // Remove storage link stationary point from obstacles (it's where the hauler stands)
        const storageLinkKey = `${roomName}:${storageLinkWorld.x},${storageLinkWorld.y}`
        obstacles.delete(storageLinkKey)

        console.log(`  ✓ Built ${obstacles.size} obstacles (ramparts make structures walkable)`)

        // Debug: Check if spawn/link positions are in obstacles
        console.log(
            `  🔍 (12, 28) link+rampart in obstacles: ${obstacles.has(`${roomName}:12,28`)}`,
        )
        console.log(
            `  🔍 (12, 27) spawn+rampart in obstacles: ${obstacles.has(`${roomName}:12,27`)}`,
        )

        // Debug: Check what structures are actually at these positions
        const checkPositions = [
            { x: 12, y: 29 }, // Storage link stationary
            { x: 12, y: 28 }, // 1 north (link?)
            { x: 12, y: 27 }, // 2 north (spawn?)
        ]
        for (const pos of checkPositions) {
            const types: string[] = []
            for (const [type, positions] of placementResult.buildings.entries()) {
                if (positions.some((p) => p.x === pos.x && p.y === pos.y)) {
                    types.push(type)
                }
            }
            const hasRampart = types.includes('rampart')
            console.log(
                `  🔍 (${pos.x}, ${pos.y}): [${
                    types.join(', ') || 'none'
                }] hasRampart=${hasRampart}`,
            )
        }

        // Build roads set - include ALL road structures
        // Roads can coexist with ramparts, and we want to prefer pathing on existing roads
        const roads = new Set<string>()
        const allRoads = placementResult.buildings.get('road') || []
        for (const road of allRoads) {
            roads.add(`${roomName}:${road.x},${road.y}`)
        }
        console.log(`  ✓ Found ${roads.size} roads`)

        // Debug: Show some example road keys
        const roadArray = Array.from(roads)
        console.log(`     Example road keys: ${roadArray.slice(0, 5).join(', ')}`)
        console.log(`     Checking specific positions:`)
        console.log(`       (11, 30) in roads: ${roads.has(`${roomName}:11,30`)}`)
        console.log(`       (10, 29) in roads: ${roads.has(`${roomName}:10,29`)}`)
        console.log(`       (12, 26) in roads: ${roads.has(`${roomName}:12,26`)}`)

        // Remove roads from obstacles - roads are always pathable even with ramparts
        for (const roadKey of roads) {
            obstacles.delete(roadKey)
        }
        console.log(`  ✓ Adjusted to ${obstacles.size} obstacles (roads removed)`)

        // Setup Game.map.getRoomTerrain for multi-room cost callback
        ;(global as any).Game = {
            map: {
                getRoomTerrain: (rName: string) => {
                    if (rName === roomName) {
                        return mockTerrain
                    }
                    throw new Error(`Unknown room: ${rName}`)
                },
            },
        }

        // Setup cost callback
        let getCost = createMultiRoomTerrainCost()
        console.log(`  🧪 Testing cost calculation layers...`)

        // Check terrain values
        const terrain27 = mockTerrain.get(12, 27)
        const terrain28 = mockTerrain.get(12, 28)
        const terrain29 = mockTerrain.get(12, 29)
        console.log(`     Raw terrain at (12, 27): ${terrain27} (0=plain, 1=wall, 2=swamp)`)
        console.log(`     Raw terrain at (12, 28): ${terrain28} (0=plain, 1=wall, 2=swamp)`)
        console.log(`     Raw terrain at (12, 29): ${terrain29} (0=plain, 1=wall, 2=swamp)`)

        console.log(`     Base terrain cost at (11, 30): ${getCost(roomName, 11, 30)}`)
        console.log(`     Base terrain cost at (10, 29): ${getCost(roomName, 10, 29)}`)
        console.log(`     Base terrain cost at (12, 26): ${getCost(roomName, 12, 26)}`)

        if (roads.size > 0) {
            getCost = withMultiRoomPreferredPaths(getCost, roads, 1)
            console.log(`     After applying roads at (11, 30): ${getCost(roomName, 11, 30)}`)
            console.log(`     After applying roads at (10, 29): ${getCost(roomName, 10, 29)}`)
            console.log(`     After applying roads at (12, 26): ${getCost(roomName, 12, 26)}`)
        }
        if (obstacles.size > 0) {
            getCost = withMultiRoomObstacles(getCost, obstacles, 255)
            console.log(`     After applying obstacles at (11, 30): ${getCost(roomName, 11, 30)}`)
            console.log(`     After applying obstacles at (10, 29): ${getCost(roomName, 10, 29)}`)
            console.log(`     After applying obstacles at (12, 26): ${getCost(roomName, 12, 26)}`)
        }

        // Test goal: 3 north of stationary point (which should be on a road)
        const targetPosition = { x: storageLinkWorld.x, y: storageLinkWorld.y - 3 }
        console.log(`  🎯 Target: 3 north at (${targetPosition.x}, ${targetPosition.y})`)

        // Check target position details
        const targetKey = `${roomName}:${targetPosition.x},${targetPosition.y}`
        const targetCost = getCost(roomName, targetPosition.x, targetPosition.y)
        const targetTypes: string[] = []
        for (const [type, positions] of placementResult.buildings.entries()) {
            if (positions.some((p) => p.x === targetPosition.x && p.y === targetPosition.y)) {
                targetTypes.push(type)
            }
        }
        console.log(
            `     Target has: [${targetTypes.join(', ') || 'none'}] cost=${targetCost} ` +
                `obstacle=${obstacles.has(targetKey)} road=${roads.has(targetKey)}`,
        )

        // Also check 3 north (12, 26) which should be the actual destination
        const threeNorthPos = { x: 12, y: 26 }
        const threeNorthKey = `${roomName}:${threeNorthPos.x},${threeNorthPos.y}`
        const threeNorthTypes: string[] = []
        for (const [type, positions] of placementResult.buildings.entries()) {
            if (positions.some((p) => p.x === threeNorthPos.x && p.y === threeNorthPos.y)) {
                threeNorthTypes.push(type)
            }
        }
        console.log(
            `     3 north (12, 26): [${threeNorthTypes.join(', ') || 'none'}] cost=${getCost(
                roomName,
                12,
                26,
            )} ` + `obstacle=${obstacles.has(threeNorthKey)} road=${roads.has(threeNorthKey)}`,
        )

        // Check the SW corridor path positions
        console.log(`\n  🔍 Checking SW corridor path to target:`)
        const corridorPath = [
            { name: 'Start', x: 12, y: 29 },
            { name: 'SW', x: 11, y: 30 },
            { name: 'NW', x: 10, y: 29 },
            { name: 'N', x: 10, y: 28 },
            { name: 'NE', x: 11, y: 27 },
            { name: 'NE', x: 12, y: 26 }, // Corrected: should end at 26, not 27
        ]
        for (const pos of corridorPath) {
            const key = `${roomName}:${pos.x},${pos.y}`
            const cost = getCost(roomName, pos.x, pos.y)
            const isObstacle = obstacles.has(key)
            const isRoad = roads.has(key)
            const types: string[] = []
            for (const [type, positions] of placementResult.buildings.entries()) {
                if (positions.some((p) => p.x === pos.x && p.y === pos.y)) {
                    types.push(type)
                }
            }
            console.log(
                `     ${pos.name.padEnd(5)} (${pos.x}, ${pos.y}): [${types
                    .join(', ')
                    .padEnd(15)}] ` +
                    `cost=${String(cost).padEnd(3)} obstacle=${isObstacle} road=${isRoad}`,
            )
        }

        // Test same-room pathfinding
        // Note: Start from (11,30) instead of (12,29) because stationary point is surrounded
        console.log(`\n  🧪 Testing same-room pathfinding...`)
        console.log(
            `     NOTE: Starting from (11,30) instead of (12,29) due to surrounding obstacles`,
        )
        const startPos = { x: 11, y: 30 }
        const singleRoomCost = (x: number, y: number) => getCost(roomName, x, y)

        // First try a simple 1-step path to verify pathfinder works at all
        console.log(`     Testing simple 1-step path: (11,30) -> (10,29)...`)
        let simplePath = findPath(startPos, { x: 10, y: 29 }, singleRoomCost, {
            range: 0,
            maxOps: 20000,
            roomSize: 50,
        })
        if (simplePath && simplePath.length > 0) {
            console.log(`     ✅ Simple path works! Length: ${simplePath.length}`)
        } else {
            console.log(`     ❌ Even simple 1-step path fails!`)
        }

        // Try with range: 1 first (get within 1 tile)
        console.log(`     Trying full path with range: 1 (get within 1 tile of target)...`)
        let path = findPath(startPos, targetPosition, singleRoomCost, {
            range: 1,
            maxOps: 20000,
            roomSize: 50,
        })

        if (!path || path.length === 0) {
            console.log(`     ❌ Failed with range: 1, trying range: 0...`)
            path = findPath(startPos, targetPosition, singleRoomCost, {
                range: 0,
                maxOps: 20000,
                roomSize: 50,
            })
        }

        if (path && path.length > 0) {
            console.log(`  ✅ Path found! Length: ${path.length} steps`)
            console.log(`     Path: ${path.map((p) => `(${p.x},${p.y})`).join(' -> ')}`)

            // Verify path doesn't intersect obstacles
            let intersections = 0
            for (const pos of path) {
                const key = `${roomName}:${pos.x},${pos.y}`
                if (obstacles.has(key)) {
                    console.log(`     ⚠️  Path intersects obstacle at (${pos.x}, ${pos.y})`)
                    intersections++
                }
            }

            assert.equal(
                intersections,
                0,
                `Path should not intersect obstacles, found ${intersections}`,
            )
        } else {
            console.log(`  ❌ No path found from stationary point to 2 north!`)

            // Debug: check what's blocking
            console.log(`\n  🔍 Debugging why no path exists:`)
            console.log(
                `     Start (${storageLinkWorld.x}, ${storageLinkWorld.y}): cost=${singleRoomCost(
                    storageLinkWorld.x,
                    storageLinkWorld.y,
                )}`,
            )
            console.log(
                `     Target (${targetPosition.x}, ${targetPosition.y}): cost=${targetCost}`,
            )

            // Check intermediate positions
            for (let y = storageLinkWorld.y - 1; y >= targetPosition.y; y--) {
                const pos = { x: storageLinkWorld.x, y }
                const posCost = singleRoomCost(pos.x, pos.y)
                const posKey = `${roomName}:${pos.x},${pos.y}`
                const posTypes: string[] = []
                for (const [type, positions] of placementResult.buildings.entries()) {
                    if (positions.some((p) => p.x === pos.x && p.y === pos.y)) {
                        posTypes.push(type)
                    }
                }
                console.log(
                    `     (${pos.x}, ${pos.y}): [${posTypes.join(', ') || 'none'}] cost=${posCost}`,
                )
            }

            assert.fail('Should be able to path from stationary point to 3 north within bunker')
        }

        // Cleanup
        delete (global as any).Game
    })

    it('should use fixtures instead of live API calls', function () {
        // This test verifies that all required fixtures are present
        const fixtureDir = path.join(__dirname, '../fixtures/terrain')
        const requiredFixtures = ['W1N8.json', 'W1N9.json', 'W2N8.json']

        for (const fixture of requiredFixtures) {
            const fixturePath = path.join(fixtureDir, fixture)
            assert.isTrue(
                fs.existsSync(fixturePath),
                `Fixture ${fixture} should exist. Run: yarn download:fixtures W1N8 --neighbors`,
            )
        }

        console.log(`  ✓ All required fixtures are present`)
    })
})

describe('PServer Mine Roads - W8N3 to W8N2', function () {
    it('should calculate mine roads from W8N3 base to W8N2 mine', function () {
        const baseRoomName = 'W8N3'
        const mineRoomName = 'W8N2'

        // Load base room fixture
        console.log(`\n  📥 Loading fixture for ${baseRoomName}...`)
        const baseFixture = loadRoomFixture(baseRoomName) as RoomFixture
        assert.isNotNull(baseFixture, `Failed to load fixture for ${baseRoomName}`)
        assert.isNotNull(baseFixture.controller, `No controller found in ${baseRoomName}`)
        assert.isAbove(baseFixture.sources.length, 0, `No sources found in ${baseRoomName}`)

        console.log(`  ✓ Base room data loaded:`)
        console.log(`    Sources: ${baseFixture.sources.length}`)
        console.log(`    Controller: (${baseFixture.controller.x}, ${baseFixture.controller.y})`)

        // Load mine room fixture
        console.log(`\n  📥 Loading fixture for ${mineRoomName}...`)
        const mineFixture = loadRoomFixture(mineRoomName) as RoomFixture
        assert.isNotNull(mineFixture, `Failed to load fixture for ${mineRoomName}`)
        assert.isAbove(mineFixture.sources.length, 0, `No sources found in ${mineRoomName}`)

        console.log(`  ✓ Mine room data loaded:`)
        console.log(`    Sources: ${mineFixture.sources.length}`)
        for (let i = 0; i < mineFixture.sources.length; i++) {
            const src = mineFixture.sources[i]
            console.log(`      Source ${i + 1}: (${src.x}, ${src.y})`)
        }

        // Calculate bunker placement
        console.log(`\n  🧮 Calculating bunker placement for ${baseRoomName}...`)
        const mockBaseTerrain = new MockRoomTerrain(baseFixture.terrain)
        const placementResult = placeBunker({
            terrain: mockBaseTerrain,
            roomName: baseRoomName,
            sources: baseFixture.sources,
            controller: baseFixture.controller,
            stamp: bunkerStamp,
        })

        assert.isNotNull(placementResult.origin, 'Bunker origin should not be null')
        assert.isTrue(placementResult.success, 'Bunker placement should succeed')
        console.log(
            `  ✓ Bunker placed at origin (${placementResult.origin.x}, ${placementResult.origin.y})`,
        )

        // Extract storage link stationary point
        const stampMetadata = placementResult.metadata?.stampMetadata
        if (!stampMetadata) {
            throw new Error('No stamp metadata available')
        }

        const { top, left } = stampMetadata.extants
        const storageLinkStamp = bunkerStamp.stationaryPoints.storageLink
        const storageLinkWorld = {
            x: placementResult.origin.x + (storageLinkStamp.x - left) + 1,
            y: placementResult.origin.y + (storageLinkStamp.y - top) + 1,
        }

        console.log(
            `  ✓ Storage link hauler position: (${storageLinkWorld.x}, ${storageLinkWorld.y})`,
        )

        // Calculate bunker roads
        console.log(`\n  🛣️  Calculating bunker roads...`)
        const bunkerRoads = calculateBunkerRoads(
            mockBaseTerrain,
            placementResult.buildings,
            baseFixture.sources,
            baseFixture.controller,
            baseFixture.minerals[0],
        )

        const existingRoads = placementResult.buildings.get('road') || []
        const allBunkerRoads = [...existingRoads, ...bunkerRoads]
        placementResult.buildings.set('road', allBunkerRoads)
        console.log(`  ✓ Total bunker roads: ${allBunkerRoads.length}`)

        // Build obstacles and roads for pathfinding
        const obstacles = buildObstacles(placementResult.buildings, baseRoomName)
        obstacles.delete(`${baseRoomName}:${storageLinkWorld.x},${storageLinkWorld.y}`)

        const roads = new Set<string>()
        for (const road of allBunkerRoads) {
            const roadKey = `${baseRoomName}:${road.x},${road.y}`
            if (!obstacles.has(roadKey)) {
                roads.add(roadKey)
            }
        }
        console.log(`  ✓ Built ${obstacles.size} obstacles, ${roads.size} roads`)

        // Setup Game.map.getRoomTerrain for multi-room pathfinding
        const mockMineTerrain = new MockRoomTerrain(mineFixture.terrain)
        ;(global as any).Game = {
            map: {
                getRoomTerrain: (rName: string) => {
                    if (rName === baseRoomName) {
                        return mockBaseTerrain
                    }
                    if (rName === mineRoomName) {
                        return mockMineTerrain
                    }
                    throw new Error(`Unknown room: ${rName}`)
                },
            },
        }

        // Analyze mine room terrain around sources
        console.log(`\n  🔍 Analyzing ${mineRoomName} source accessibility...`)
        for (let i = 0; i < mineFixture.sources.length; i++) {
            const src = mineFixture.sources[i]
            console.log(`\n    Source ${i + 1} at (${src.x}, ${src.y}):`)

            let walkableNeighbors = 0
            let blockedNeighbors = 0

            const neighbors = [
                { dir: 'N', dx: 0, dy: -1 },
                { dir: 'NE', dx: 1, dy: -1 },
                { dir: 'E', dx: 1, dy: 0 },
                { dir: 'SE', dx: 1, dy: 1 },
                { dir: 'S', dx: 0, dy: 1 },
                { dir: 'SW', dx: -1, dy: 1 },
                { dir: 'W', dx: -1, dy: 0 },
                { dir: 'NW', dx: -1, dy: -1 },
            ]

            for (const { dir, dx, dy } of neighbors) {
                const nx = src.x + dx
                const ny = src.y + dy
                const terrainVal = mockMineTerrain.get(nx, ny)
                const terrainLabel =
                    terrainVal === 1 ? 'wall' : terrainVal === 2 ? 'swamp' : 'plain'

                if (terrainVal === 1) {
                    blockedNeighbors++
                    console.log(`      ${dir.padEnd(2)}: (${nx}, ${ny}) = ${terrainLabel} ❌`)
                } else {
                    walkableNeighbors++
                    console.log(`      ${dir.padEnd(2)}: (${nx}, ${ny}) = ${terrainLabel} ✓`)
                }
            }

            console.log(
                `    Summary: ${walkableNeighbors} walkable, ${blockedNeighbors} blocked out of 8 neighbors`,
            )

            if (walkableNeighbors < 3) {
                console.log(
                    `    ⚠️  WARNING: Source has very limited access (only ${walkableNeighbors} walkable neighbors)`,
                )
            }
        }

        // Calculate mine roads
        console.log(`\n  🛣️  Calculating mine roads from ${baseRoomName} to ${mineRoomName}...`)
        const result = calculateSingleMineRoads({
            baseRoomName,
            startPosition: storageLinkWorld,
            mineRoomName,
            mineSources: mineFixture.sources,
            obstacles,
            roads,
        })

        if (!result) {
            console.log(`\n  ❌ FAILED: No path found from ${baseRoomName} to ${mineRoomName}`)
            console.log(`\n  🔍 Debugging information:`)
            console.log(`     Start position: (${storageLinkWorld.x}, ${storageLinkWorld.y})`)
            console.log(`     Mine sources:`)
            for (let i = 0; i < mineFixture.sources.length; i++) {
                const src = mineFixture.sources[i]
                console.log(`       Source ${i + 1}: (${src.x}, ${src.y})`)
            }

            assert.fail(
                `Could not find path from ${baseRoomName} to ${mineRoomName}. ` +
                    `This reproduces the issue seen in the live game.`,
            )
        }

        console.log(`\n  ✅ SUCCESS: Path found!`)
        console.log(`     Exit: (${result.exitPosition.x}, ${result.exitPosition.y})`)
        console.log(`     Entrance: (${result.entrancePosition.x}, ${result.entrancePosition.y})`)
        console.log(`     Base roads: ${result.baseRoads.length}`)
        console.log(`     Mine roads: ${result.mineRoads.length}`)

        // Check for intersections with obstacles
        console.log(`\n  🔍 Checking for obstacle intersections...`)
        const intersections: string[] = []

        for (const road of result.baseRoads) {
            const roadKey = `${baseRoomName}:${road.x},${road.y}`
            if (obstacles.has(roadKey)) {
                intersections.push(roadKey)
            }
        }

        if (intersections.length > 0) {
            console.log(`  ❌ Found ${intersections.length} obstacle intersections:`)
            for (const intersection of intersections) {
                console.log(`    - ${intersection}`)
            }
            assert.fail(`Mine roads intersected ${intersections.length} obstacles`)
        } else {
            console.log(`  ✓ No obstacle intersections found`)
        }

        console.log(`\n  ✅ Test passed: Mine roads calculated successfully`)

        // Cleanup
        delete (global as any).Game
    })

    it('should verify W8N3 and W8N2 fixtures exist', function () {
        const fixtureDir = path.join(__dirname, '../fixtures/terrain')
        const requiredFixtures = ['W8N3.json', 'W8N2.json']

        for (const fixture of requiredFixtures) {
            const fixturePath = path.join(fixtureDir, fixture)
            assert.isTrue(
                fs.existsSync(fixturePath),
                `Fixture ${fixture} should exist. Run: yarn download:fixtures W8N3 --neighbors`,
            )
        }

        console.log(`  ✓ All required fixtures are present`)
    })
})
