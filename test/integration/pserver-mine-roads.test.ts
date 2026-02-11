import { assert } from 'chai'
import * as fs from 'fs'
import * as path from 'path'
import { calculateSingleMineRoads } from '../../src/stamps/single-mine-roads'
import bunkerStamp from '../../src/stamps/bunker'
import { placeBunker } from '../../src/stamps/placement'
import { calculateStationaryPoints } from '../../src/stamps/stationary-points'
import { calculateBunkerRoads } from '../../src/stamps/roads'
import {
    createMultiRoomTerrainCost,
    withMultiRoomObstacles,
    withMultiRoomPreferredPaths,
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
        if (value === 0 || value === 1 || value === 2) {
            return value as 0 | 1 | 2
        }
        return 0
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
 * All structures except roads and ramparts are obstacles (cost 255)
 */
function buildObstacles(
    buildings: Map<string, { x: number; y: number }[]>,
    roomName: string,
): Set<string> {
    const obstacles = new Set<string>()

    // Add all non-road, non-rampart structures as obstacles
    // These are ALWAYS obstacles even if a rampart is on the same tile
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
        const mineRoomNames = ['W1N7', 'W1N9', 'W2N8']
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

        // Use the stamp's stationary point for pathfinding
        const startPosition = storageLinkWorld
        console.log(
            `  ℹ️  Using storage link hauler position: (${startPosition.x}, ${startPosition.y})`,
        )

        // Compare per-tile costs for candidate corridors using the same cost function as pathfinding
        let getCost = createMultiRoomTerrainCost()
        if (roads.size > 0) {
            getCost = withMultiRoomPreferredPaths(getCost, roads, 1)
        }
        if (obstacles.size > 0) {
            getCost = withMultiRoomObstacles(getCost, obstacles, 255)
        }

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

        // Calculate mine roads for each neighboring mine room
        console.log(`\n  🛣️  Calculating mine roads...`)
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

    it('should use fixtures instead of live API calls', function () {
        // This test verifies that all required fixtures are present
        const fixtureDir = path.join(__dirname, '../fixtures/terrain')
        const requiredFixtures = ['W1N8.json', 'W1N7.json', 'W1N9.json', 'W2N8.json']

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
