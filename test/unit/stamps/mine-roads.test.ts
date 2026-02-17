import { assert } from 'chai'
import { calculateSingleMineRoads } from '../../../src/stamps/single-mine-roads'
import { placeBunker } from '../../../src/stamps/placement'
import { calculateBunkerRoads } from '../../../src/stamps/roads'
import bunkerStamp from '../../../src/stamps/bunker'
import {
    createTerrainCostCallback,
    findPath,
    withPreferred,
    withObstacles,
} from '../../../src/libs/pathfinding'

// Mock RoomTerrain for testing
class MockRoomTerrain implements RoomTerrain {
    private terrain: number[][]

    constructor(terrain: number[][]) {
        this.terrain = terrain
    }

    get(x: number, y: number): 0 | 1 | 2 {
        if (x < 0 || x >= 50 || y < 0 || y >= 50) {
            return 1 // Wall
        }
        const value = this.terrain[y][x]
        if (value === 0 || value === 1 || value === 2) {
            return value
        }
        return 0 // Default to plain if invalid
    }
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

describe('calculateSingleMineRoads', () => {
    beforeEach(() => {
        // Mock Game.map.getRoomTerrain for multi-room pathfinding
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ;(global as any).Game = {
            map: {
                getRoomTerrain: (roomName: string) => {
                    // Create simple test terrain - all plains (0)
                    const terrain: number[][] = []
                    for (let y = 0; y < 50; y++) {
                        terrain[y] = []
                        for (let x = 0; x < 50; x++) {
                            terrain[y][x] = 0 // Plain
                        }
                    }

                    // Add room-specific terrain features if needed
                    if (roomName === 'E52S29') {
                        // Base room - no special terrain
                    } else if (roomName === 'E53S29') {
                        // Mine room (East) - no special terrain
                    } else if (roomName === 'E51S29') {
                        // Mine room (West) - no special terrain
                    }

                    return new MockRoomTerrain(terrain)
                },
            },
        }
    })

    afterEach(() => {
        // Clean up global mock
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        delete (global as any).Game
    })

    it('should find a path from base to adjacent mine room (East)', () => {
        const result = calculateSingleMineRoads({
            baseRoomName: 'E52S29',
            startPosition: { x: 25, y: 25 },
            mineRoomName: 'E53S29',
            mineSources: [{ x: 10, y: 10 }],
        })

        assert.isNotNull(result, 'Should find a path')
        assert.isDefined(result!.exitPosition)
        assert.isDefined(result!.entrancePosition)
        assert.isArray(result!.baseRoads)
        assert.isArray(result!.mineRoads)

        // Exit should be at room edge (x=49)
        assert.equal(result!.exitPosition.x, 49)

        // Entrance should be at opposite edge (x=0)
        assert.equal(result!.entrancePosition.x, 0)

        // Should have roads in both rooms
        assert.isAbove(result!.baseRoads.length, 0, 'Should have roads in base room')
        assert.isAbove(result!.mineRoads.length, 0, 'Should have roads in mine room')
    })

    it('should find a path from base to adjacent mine room (West)', () => {
        const result = calculateSingleMineRoads({
            baseRoomName: 'E52S29',
            startPosition: { x: 25, y: 25 },
            mineRoomName: 'E51S29',
            mineSources: [{ x: 40, y: 25 }],
        })

        assert.isNotNull(result, 'Should find a path')

        // Exit should be at west edge (x=0)
        assert.equal(result!.exitPosition.x, 0)

        // Entrance should be at opposite edge (x=49)
        assert.equal(result!.entrancePosition.x, 49)
    })

    it('should prefer existing roads over plain terrain', () => {
        const roads = new Set<string>()
        // Create a road path from (25,25) to (40,25)
        for (let x = 25; x <= 40; x++) {
            roads.add(`E52S29:${x},25`)
        }

        const result = calculateSingleMineRoads({
            baseRoomName: 'E52S29',
            startPosition: { x: 25, y: 25 },
            mineRoomName: 'E53S29',
            mineSources: [{ x: 10, y: 25 }],
            roads,
        })

        assert.isNotNull(result)

        // Path should follow the roads (same y-coordinate)
        const roadsOnY25 = result!.baseRoads.filter((r) => r.y === 25)
        assert.isAbove(roadsOnY25.length, 0, 'Should use existing roads at y=25')
    })

    it('should avoid obstacles', () => {
        const obstacles = new Set<string>()
        // Block direct path - create wall from (30,20) to (30,30)
        for (let y = 20; y <= 30; y++) {
            obstacles.add(`E52S29:30,${y}`)
        }

        const result = calculateSingleMineRoads({
            baseRoomName: 'E52S29',
            startPosition: { x: 25, y: 25 },
            mineRoomName: 'E53S29',
            mineSources: [{ x: 10, y: 25 }],
            obstacles,
        })

        assert.isNotNull(result, 'Should find alternate path')

        // Path should not go through the blocked segment at x=30, y=20-30
        const roadsInBlocked = result.baseRoads.filter((r) => r.x === 30 && r.y >= 20 && r.y <= 30)
        assert.equal(roadsInBlocked.length, 0, 'Should not path through blocked segment')
    })

    it('should return null when no path exists', () => {
        const obstacles = new Set<string>()
        // Block all paths - create a complete wall around the start position
        for (let y = 20; y <= 30; y++) {
            for (let x = 20; x <= 30; x++) {
                if (x === 25 && y === 25) continue // Don't block start
                obstacles.add(`E52S29:${x},${y}`)
            }
        }

        const result = calculateSingleMineRoads({
            baseRoomName: 'E52S29',
            startPosition: { x: 25, y: 25 },
            mineRoomName: 'E53S29',
            mineSources: [{ x: 10, y: 10 }],
            obstacles,
        })

        assert.isNull(result, 'Should return null when completely blocked')
    })

    it('should path to closest source when multiple sources exist', () => {
        const result = calculateSingleMineRoads({
            baseRoomName: 'E52S29',
            startPosition: { x: 25, y: 25 },
            mineRoomName: 'E53S29',
            mineSources: [
                { x: 10, y: 10 }, // Far
                { x: 10, y: 25 }, // Closer (same y)
            ],
        })

        assert.isNotNull(result)

        // Should path to the closer source (y=25)
        // The entrance position should be close to y=25
        assert.isTrue(
            Math.abs(result!.entrancePosition.y - 25) <= 3,
            'Should path to closer source',
        )
    })

    it('should handle range parameter correctly', () => {
        // Without range, tests path exactly to source
        // With range: 1, tests path to adjacent position
        // Our function uses range: 1 internally, so paths should stop adjacent to source
        const result = calculateSingleMineRoads({
            baseRoomName: 'E52S29',
            startPosition: { x: 25, y: 25 },
            mineRoomName: 'E53S29',
            mineSources: [{ x: 10, y: 10 }],
        })

        assert.isNotNull(result)

        // Last position in mine path should be adjacent to source (not on source)
        const lastMinePos = result!.mineRoads[result!.mineRoads.length - 1]
        const dx = Math.abs(lastMinePos.x - 10)
        const dy = Math.abs(lastMinePos.y - 10)
        const dist = Math.max(dx, dy)

        assert.isAtMost(dist, 1, 'Path should end adjacent to source (range 1)')
    })

    it('should not include start position in road list', () => {
        const result = calculateSingleMineRoads({
            baseRoomName: 'E52S29',
            startPosition: { x: 25, y: 25 },
            mineRoomName: 'E53S29',
            mineSources: [{ x: 10, y: 10 }],
        })

        assert.isNotNull(result)

        // Start position should not be in baseRoads
        const hasStartPos = result!.baseRoads.some((r) => r.x === 25 && r.y === 25)
        assert.isFalse(hasStartPos, 'Start position should not be in road list')
    })

    it('should handle both obstacles and roads together', () => {
        const obstacles = new Set<string>()
        const roads = new Set<string>()

        // Block direct path
        for (let y = 20; y <= 30; y++) {
            obstacles.add(`E52S29:30,${y}`)
        }

        // Create preferred alternate route at x=35
        for (let y = 20; y <= 30; y++) {
            roads.add(`E52S29:35,${y}`)
        }

        const result = calculateSingleMineRoads({
            baseRoomName: 'E52S29',
            startPosition: { x: 25, y: 25 },
            mineRoomName: 'E53S29',
            mineSources: [{ x: 10, y: 25 }],
            obstacles,
            roads,
        })

        assert.isNotNull(result, 'Should find path using roads')

        // Should avoid x=30 in the blocked y-range (obstacles)
        const roadsInBlocked = result!.baseRoads.filter((r) => r.x === 30 && r.y >= 20 && r.y <= 30)
        assert.equal(roadsInBlocked.length, 0, 'Should avoid blocked segment')

        // Should prefer x=35 (roads) if path goes that way
        const roadsAtX35 = result!.baseRoads.filter((r) => r.x === 35)
        // Note: Path might not use x=35 if there's a shorter route, but it shouldn't use x=30 in the blocked range
    })

    it('should work with real terrain from E52S29 to E53S29', () => {
        const fs = require('fs')
        const path = require('path')

        // Load real terrain data
        const e52s29Data = JSON.parse(
            fs.readFileSync(path.join(__dirname, '../../fixtures/terrain/E52S29.json'), 'utf8'),
        )
        const e53s29Data = JSON.parse(
            fs.readFileSync(path.join(__dirname, '../../fixtures/terrain/E53S29.json'), 'utf8'),
        )

        // Mock Game.map.getRoomTerrain with real data
        ;(global.Game.map as any).getRoomTerrain = (roomName: string) => {
            const data = roomName === 'E52S29' ? e52s29Data : e53s29Data
            return {
                get: (x: number, y: number) => data.terrain[y][x] || 0,
            }
        }

        // Real source positions from E53S29
        const mineSources = e53s29Data.sources

        console.log(`Real mine sources in E53S29: ${JSON.stringify(mineSources)}`)

        // Use storage link stationary point from bunker stamp
        // Bunker anchor is at (11, 14), stamp storage link is at (22, 16)
        // So world position is (33, 30)
        const storageLink = { x: 33, y: 30 }

        console.log(
            `Testing pathfinding from E52S29(${storageLink.x},${storageLink.y}) to E53S29 sources`,
        )
        console.log(
            `Start position terrain: ${(global.Game.map as any)
                .getRoomTerrain('E52S29')
                .get(storageLink.x, storageLink.y)}`,
        )

        const result = calculateSingleMineRoads({
            baseRoomName: 'E52S29',
            startPosition: storageLink,
            mineRoomName: 'E53S29',
            mineSources,
            obstacles: new Set(),
            roads: new Set(),
        })

        console.log(
            `Real terrain test result: ${
                result
                    ? `${result.baseRoads.length} base roads, ${result.mineRoads.length} mine roads`
                    : 'null'
            }`,
        )

        if (!result) {
            // Debug: Check if positions are walkable
            const terrain = (global.Game.map as any).getRoomTerrain('E52S29')
            console.log(`Checking neighbors of start position:`)
            for (let dx = -1; dx <= 1; dx++) {
                for (let dy = -1; dy <= 1; dy++) {
                    if (dx === 0 && dy === 0) continue
                    const x = storageLink.x + dx
                    const y = storageLink.y + dy
                    const t = terrain.get(x, y)
                    console.log(
                        `  (${x},${y}): terrain=${t} (${
                            t === 0 ? 'plain' : t === 1 ? 'wall' : 'swamp'
                        })`,
                    )
                }
            }

            // Check room boundary positions
            console.log(`Checking east boundary (x=49):`)
            for (let y = 0; y < 50; y++) {
                const t1 = terrain.get(49, y)
                const t2 = (global.Game.map as any).getRoomTerrain('E53S29').get(0, y)
                if (t1 !== 1 && t2 !== 1) {
                    console.log(
                        `  y=${y}: E52S29(49,${y})=${t1}, E53S29(0,${y})=${t2} - WALKABLE CROSSING`,
                    )
                }
            }
        }

        assert.isNotNull(result, 'Should find path with real terrain')
        assert.isTrue(result!.baseRoads.length > 0, 'Should have base roads')
        assert.isTrue(result!.mineRoads.length > 0, 'Should have mine roads')
    })

    it('should work with real terrain from E56S28 to E56S27 (North)', () => {
        // Load real terrain from fixtures
        const baseTerrainData = require('../../fixtures/terrain/E56S28.json')
        const mineTerrainData = require('../../fixtures/terrain/E56S27.json')

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ;(global as any).Game = {
            map: {
                getRoomTerrain: (roomName: string) => {
                    if (roomName === 'E56S28') {
                        return new MockRoomTerrain(baseTerrainData.terrain)
                    } else if (roomName === 'E56S27') {
                        return new MockRoomTerrain(mineTerrainData.terrain)
                    }
                    // Default to walls
                    const terrain: number[][] = []
                    for (let y = 0; y < 50; y++) {
                        terrain[y] = []
                        for (let x = 0; x < 50; x++) {
                            terrain[y][x] = 1 // Wall
                        }
                    }
                    return new MockRoomTerrain(terrain)
                },
            },
        }

        // Get sources from terrain data
        const mineSources = mineTerrainData.sources

        console.log(`Real mine sources in E56S27: ${JSON.stringify(mineSources)}`)

        // From layout:bunker output: bunker origin at (5, 26), center at (12, 33)
        // Storage link in stamp is at offset (22, 16) from anchor (11, 14)
        // Bunker anchor = origin + stamp anchor offset = (5, 26) + (11, 14) = (16, 40)
        // Storage link = bunker anchor + stamp storage link offset - stamp anchor
        // = (16, 40) + (22, 16) - (11, 14) = (16, 40) + (11, 2) = (27, 42)
        const storageLink = { x: 16, y: 32 } // Recalculated based on stamp

        console.log(
            `Testing pathfinding from E56S28(${storageLink.x},${storageLink.y}) to E56S27 sources`,
        )
        console.log(
            `Start position terrain: ${(global.Game.map as any)
                .getRoomTerrain('E56S28')
                .get(storageLink.x, storageLink.y)}`,
        )

        const result = calculateSingleMineRoads({
            baseRoomName: 'E56S28',
            startPosition: storageLink,
            mineRoomName: 'E56S27',
            mineSources,
            obstacles: new Set(),
            roads: new Set(),
        })

        console.log(
            `Real terrain test result: ${
                result
                    ? `${result.baseRoads.length} base roads, ${result.mineRoads.length} mine roads`
                    : 'null'
            }`,
        )

        if (!result) {
            // Debug: Check if positions are walkable
            const terrain = (global.Game.map as any).getRoomTerrain('E56S28')
            console.log(`Checking neighbors of start position:`)
            for (let dx = -1; dx <= 1; dx++) {
                for (let dy = -1; dy <= 1; dy++) {
                    if (dx === 0 && dy === 0) continue
                    const x = storageLink.x + dx
                    const y = storageLink.y + dy
                    const t = terrain.get(x, y)
                    console.log(
                        `  (${x},${y}): terrain=${t} (${
                            t === 0 ? 'plain' : t === 1 ? 'wall' : 'swamp'
                        })`,
                    )
                }
            }

            // Check room boundary positions
            console.log(`Checking north boundary (y=0):`)
            for (let x = 0; x < 50; x++) {
                const t1 = terrain.get(x, 0)
                const t2 = (global.Game.map as any).getRoomTerrain('E56S27').get(x, 49)
                if (t1 !== 1 && t2 !== 1) {
                    console.log(
                        `  x=${x}: E56S28(${x},0)=${t1}, E56S27(${x},49)=${t2} - WALKABLE CROSSING`,
                    )
                }
            }
        }

        assert.isNotNull(result, 'Should find path with real terrain from E56S28 to E56S27')
        if (result) {
            assert.isTrue(result.baseRoads.length > 0, 'Should have base roads')
            assert.isTrue(result.mineRoads.length > 0, 'Should have mine roads')
        }
    })

    it('should handle diagonal paths when start position is surrounded except SE/SW', () => {
        // Simpler test: just verify diagonal pathfinding works at all
        // Block only N and E so the path MUST go diagonal (NE direction blocked, so goes SE then curves)

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ;(global as any).Game = {
            map: {
                getRoomTerrain: (roomName: string) => {
                    const terrain: number[][] = []
                    for (let y = 0; y < 50; y++) {
                        terrain[y] = []
                        for (let x = 0; x < 50; x++) {
                            terrain[y][x] = 0 // Plain by default
                        }
                    }

                    return new MockRoomTerrain(terrain)
                },
            },
        }

        // Source in east mine room
        const mineSources = [{ x: 10, y: 10 }]

        // Start position in base room
        const startPosition = { x: 25, y: 25 }

        // Block ONLY N and E (forcing path to go via other directions)
        const obstacles = new Set<string>()
        obstacles.add('E52S29:25,24') // N - blocked
        obstacles.add('E52S29:26,25') // E - blocked

        console.log(
            `Testing diagonal pathfinding from E52S29(${startPosition.x},${startPosition.y}) to E53S29 (East)`,
        )
        console.log('Start position: N and E blocked (should go diagonal or via W/S)')

        const result = calculateSingleMineRoads({
            baseRoomName: 'E52S29',
            startPosition,
            mineRoomName: 'E53S29',
            mineSources,
            obstacles,
            roads: new Set(),
        })

        console.log(
            `Diagonal test result: ${
                result
                    ? `${result.baseRoads.length} base roads, ${result.mineRoads.length} mine roads, exit at (${result.exitPosition.x},${result.exitPosition.y})`
                    : 'null'
            }`,
        )

        if (result) {
            console.log(
                `Exit position: (${result.exitPosition.x}, ${result.exitPosition.y}), Entrance: (${result.entrancePosition.x}, ${result.entrancePosition.y})`,
            )
            console.log(`First few road positions:`)
            for (let i = 0; i < Math.min(5, result.baseRoads.length); i++) {
                const road = result.baseRoads[i]
                console.log(`  Road ${i}: (${road.x}, ${road.y})`)
            }

            // First move should NOT be N (25,24) or E (26,25) since those are blocked
            const firstRoad = result.baseRoads[0]
            const isBlockedDirection =
                (firstRoad.x === 25 && firstRoad.y === 24) ||
                (firstRoad.x === 26 && firstRoad.y === 25)

            assert.isFalse(
                isBlockedDirection,
                `First move should avoid blocked N and E, got (${firstRoad.x},${firstRoad.y})`,
            )
        }

        assert.isNotNull(result, 'Should find path when N and E are blocked')
        if (result) {
            assert.isTrue(result.baseRoads.length > 0, 'Should have base roads')
            assert.isTrue(result.mineRoads.length > 0, 'Should have mine roads')
        }
    })

    it('should find diagonal path when all 4 cardinals are blocked', function () {
        // This test verifies that astar-typescript-cost can handle the case that PathFinding.js failed:
        // When all 4 cardinal directions (N, E, S, W) around the start position are blocked,
        // it should still find a diagonal path (NE, NW, SE, or SW)

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ;(global as any).Game = {
            map: {
                getRoomTerrain: (roomName: string) => {
                    const terrain: number[][] = []
                    for (let y = 0; y < 50; y++) {
                        terrain[y] = []
                        for (let x = 0; x < 50; x++) {
                            terrain[y][x] = 0 // Plain by default
                        }
                    }

                    return new MockRoomTerrain(terrain)
                },
            },
        }

        const startRoom = 'E52S29'
        const sourceRoom = 'E53S29'
        const startPosition = { x: 25, y: 25 }
        const mineSources = [{ x: 10, y: 10 }]

        // Block all 4 cardinal directions around start position (25, 25)
        // N: (25, 24), E: (26, 25), S: (25, 26), W: (24, 25)
        const obstacles = new Set<string>()
        obstacles.add('E52S29:25,24') // N
        obstacles.add('E52S29:26,25') // E
        obstacles.add('E52S29:25,26') // S
        obstacles.add('E52S29:24,25') // W

        const result = calculateSingleMineRoads({
            baseRoomName: startRoom,
            mineRoomName: sourceRoom,
            startPosition: startPosition,
            mineSources: mineSources,
            obstacles: obstacles,
            roads: new Set<string>(),
        })

        if (result) {
            console.log('\n[Diagonal Test with 4 Cardinals Blocked]')
            console.log(`  Start: (${startPosition.x}, ${startPosition.y})`)
            console.log(`  Found ${result.baseRoads.length} base roads`)
            console.log('  First 5 roads:')
            for (let i = 0; i < Math.min(5, result.baseRoads.length); i++) {
                const road = result.baseRoads[i]
                const dx = road.x - startPosition.x
                const dy = road.y - startPosition.y
                console.log(`  Road ${i}: (${road.x}, ${road.y}) - dx=${dx}, dy=${dy}`)
            }

            // The path should contain at least one diagonal move in the first few steps
            // since all cardinals are blocked
            let hasDiagonalInFirstSteps = false
            for (let i = 0; i < Math.min(3, result.baseRoads.length); i++) {
                if (i === 0) continue // Skip first as it may not be immediate neighbor
                const road = result.baseRoads[i]
                const prevRoad = result.baseRoads[i - 1]
                const dx = road.x - prevRoad.x
                const dy = road.y - prevRoad.y
                if (Math.abs(dx) === 1 && Math.abs(dy) === 1) {
                    hasDiagonalInFirstSteps = true
                    console.log(
                        `  Found diagonal move at step ${i}: (${prevRoad.x},${prevRoad.y}) -> (${road.x},${road.y})`,
                    )
                    break
                }
            }

            assert.isTrue(
                hasDiagonalInFirstSteps,
                'Path should use diagonal moves since all cardinals are blocked',
            )
        }

        assert.isNotNull(result, 'Should find path when all 4 cardinals are blocked')
        if (result) {
            assert.isTrue(result.baseRoads.length > 0, 'Should have base roads')
            assert.isTrue(result.mineRoads.length > 0, 'Should have mine roads')
        }
    })

    it('should reach north boundary (y=0) in W1N8 with real terrain', function () {
        // Test: Can we path from the start position (11, 30) to the north boundary (y=0) in W1N8?
        // Using the low-level single-room pathfinding API directly.

        const baseTerrainData = require('../../fixtures/terrain/W1N8.json')

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ;(global as any).Game = {
            map: {
                getRoomTerrain: (roomName: string) => {
                    if (roomName === 'W1N8') {
                        return new MockRoomTerrain(baseTerrainData.terrain)
                    }
                    const terrain: number[][] = []
                    for (let y = 0; y < 50; y++) {
                        terrain[y] = []
                        for (let x = 0; x < 50; x++) {
                            terrain[y][x] = 1 // Wall
                        }
                    }
                    return new MockRoomTerrain(terrain)
                },
            },
        }

        const startPosition = { x: 11, y: 30 }

        // Goal: reach north boundary at roughly the same x coordinate
        const northGoals = [
            { x: 10, y: 1 }, // Just inside the room, not on boundary
            { x: 11, y: 1 },
            { x: 12, y: 1 },
        ]

        console.log(`\n[W1N8 North Boundary Test - Single Room Pathfinding]`)
        console.log(
            `  Start: W1N8(${startPosition.x}, ${startPosition.y}) [ROAD ADJACENT TO STORAGE LINK]`,
        )
        console.log(`  Goals: Near north boundary (y=1) at x=10,11,12`)
        console.log(
            `  Note: This tests from an accessible road position, not the storage link itself`,
        )

        // Check terrain along x=11 column
        const terrain = (global.Game.map as any).getRoomTerrain('W1N8')
        console.log(`  Terrain column x=11, y=0 to y=30:`)
        for (let y = 0; y <= 30; y += 5) {
            const t = terrain.get(11, y)
            const label = t === 0 ? 'plain' : t === 1 ? 'WALL' : t === 2 ? 'swamp' : 'source'
            console.log(`    (11, ${y}): ${label}`)
        }

        // Use the single-room pathfinding API
        const { createTerrainCostCallback, findPath } = require('../../../src/libs/pathfinding')

        const costFn = createTerrainCostCallback(terrain)

        console.log(`  Calling findPath for single room...`)
        const path = findPath(startPosition, northGoals, costFn, {
            range: 1,
            roomSize: 50,
        })

        console.log(
            `  Result: ${path ? `Found path with ${path.length} steps` : 'NULL - NO PATH FOUND'}`,
        )

        if (path && path.length > 0) {
            console.log(`  First 5 positions:`)
            for (let i = 0; i < Math.min(5, path.length); i++) {
                const pos = path[i]
                console.log(`    ${i}: (${pos.x}, ${pos.y})`)
            }
            console.log(`  Last 5 positions:`)
            const start = Math.max(0, path.length - 5)
            for (let i = start; i < path.length; i++) {
                const pos = path[i]
                console.log(`    ${i}: (${pos.x}, ${pos.y})`)
            }
        }

        // This test verifies we can path within W1N8 to the north
        assert.isNotNull(path, 'Should be able to reach north boundary within W1N8')
        assert.isTrue(path!.length > 0, 'Path should have at least one step')
    })

    it.skip('W1N8 -> W1N7 is IMPOSSIBLE - not a mine room', function () {
        // W1N7 is NOT a mine room for W1N8 on the private server.
        // The actual mine rooms are W1N9 (west) and W2N8 (east).
        //
        // Additionally, W1N7's entire south boundary (y=49) is solid walls,
        // making it physically impossible to enter from W1N8 even if it were a mine room.
        //
        // This test is kept for documentation purposes only.
    })

    it('should reach north boundary with W1N8 bunker roads (no obstacles)', function () {
        // Test: Verify pathfinding works with bunker roads but WITHOUT obstacles
        // This establishes the baseline - roads alone should not break pathfinding

        const roomName = 'W1N8'
        const baseTerrainData = require('../../fixtures/terrain/W1N8.json')

        // Load fixture data
        const baseFixture = baseTerrainData as {
            terrain: number[][]
            sources: { x: number; y: number }[]
            controller: { x: number; y: number }
            minerals: { x: number; y: number; mineralType: string }[]
        }

        const mockTerrain = new MockRoomTerrain(baseFixture.terrain)

        // Setup global Game mock
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ;(global as any).Game = {
            map: {
                getRoomTerrain: (rName: string) => {
                    if (rName === roomName) {
                        return mockTerrain
                    }
                    // Return walls for other rooms
                    const terrain: number[][] = []
                    for (let y = 0; y < 50; y++) {
                        terrain[y] = []
                        for (let x = 0; x < 50; x++) {
                            terrain[y][x] = 1
                        }
                    }
                    return new MockRoomTerrain(terrain)
                },
            },
        }

        // Place bunker
        const placementResult = placeBunker({
            terrain: mockTerrain,
            roomName,
            sources: baseFixture.sources,
            controller: baseFixture.controller,
            stamp: bunkerStamp,
        })

        assert.isTrue(placementResult.success, 'Bunker placement should succeed')

        // Get storage link position (stationary point from bunker stamp)
        const stampMetadata = placementResult.metadata?.stampMetadata
        if (!stampMetadata) {
            throw new Error('No stamp metadata available')
        }
        const { top, left } = stampMetadata.extants
        const storageLinkStamp = bunkerStamp.stationaryPoints.storageLink
        const storageLinkWorld = {
            x: placementResult.origin!.x + (storageLinkStamp.x - left) + 1,
            y: placementResult.origin!.y + (storageLinkStamp.y - top) + 1,
        }

        // Calculate bunker roads using storage link stationary point
        const bunkerRoads = calculateBunkerRoads(
            mockTerrain,
            placementResult.buildings,
            storageLinkWorld,
            baseFixture.sources,
            baseFixture.controller,
            baseFixture.minerals[0],
        )

        const existingRoads = placementResult.buildings.get('road') || []
        const allRoads = [...existingRoads, ...bunkerRoads]

        console.log(`\n[W1N8 Bunker Roads Test - NO OBSTACLES]`)
        console.log(`  Total roads: ${allRoads.length}`)

        // Build roads set for pathfinding
        const roads = new Map<string, number>()
        for (const road of allRoads) {
            roads.set(`${road.x},${road.y}`, 1) // Roads have cost 1
        }

        const startPosition = storageLinkWorld
        const northGoals = [
            { x: 10, y: 1 },
            { x: 11, y: 1 },
            { x: 12, y: 1 },
        ]

        console.log(`  Start: Storage Link at (${startPosition.x}, ${startPosition.y})`)
        console.log(`  Goals: North boundary (y=1)`)

        // Create cost function with roads preferred
        const baseCost = createTerrainCostCallback(mockTerrain)
        const costFnWithRoads = withPreferred(baseCost, roads)

        const path = findPath(startPosition, northGoals, costFnWithRoads, {
            range: 1,
            roomSize: 50,
        })

        console.log(
            `  Result: ${path ? `Found path with ${path.length} steps` : 'NULL - NO PATH FOUND'}`,
        )

        // Cleanup
        delete (global as any).Game

        // This should PASS - roads alone don't block pathfinding
        assert.isNotNull(path, 'Should find path to north with bunker roads (no obstacles)')
        assert.isTrue(path!.length > 0, 'Path should have at least one step')
    })

    it.skip('should identify minimal obstacles that block W1N8 north pathfinding', function () {
        // NOTE: This test is obsolete - it was based on ramparts being incorrectly treated as obstacles
        // The bug has been fixed: ramparts are now correctly excluded from obstacles
        // Keeping this skipped as historical reference for the debugging process

        this.timeout(60000) // Increase timeout for iterative search

        const roomName = 'W1N8'
        const baseTerrainData = require('../../fixtures/terrain/W1N8.json')

        const baseFixture = baseTerrainData as {
            terrain: number[][]
            sources: { x: number; y: number }[]
            controller: { x: number; y: number }
            minerals: { x: number; y: number; mineralType: string }[]
        }

        const mockTerrain = new MockRoomTerrain(baseFixture.terrain)

        // Setup global Game mock
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ;(global as any).Game = {
            map: {
                getRoomTerrain: (rName: string) => {
                    if (rName === roomName) {
                        return mockTerrain
                    }
                    const terrain: number[][] = []
                    for (let y = 0; y < 50; y++) {
                        terrain[y] = []
                        for (let x = 0; x < 50; x++) {
                            terrain[y][x] = 1
                        }
                    }
                    return new MockRoomTerrain(terrain)
                },
            },
        }

        // Place bunker and get all obstacles
        const placementResult = placeBunker({
            terrain: mockTerrain,
            roomName,
            sources: baseFixture.sources,
            controller: baseFixture.controller,
            stamp: bunkerStamp,
        })

        // Get storage link position (stationary point from bunker stamp)
        const stampMetadata = placementResult.metadata?.stampMetadata
        if (!stampMetadata) {
            throw new Error('No stamp metadata available')
        }
        const { top, left } = stampMetadata.extants
        const storageLinkStamp = bunkerStamp.stationaryPoints.storageLink
        const storageLinkWorld = {
            x: placementResult.origin!.x + (storageLinkStamp.x - left) + 1,
            y: placementResult.origin!.y + (storageLinkStamp.y - top) + 1,
        }

        // Calculate bunker roads using storage link stationary point
        const bunkerRoads = calculateBunkerRoads(
            mockTerrain,
            placementResult.buildings,
            storageLinkWorld,
            baseFixture.sources,
            baseFixture.controller,
            baseFixture.minerals[0],
        )

        const existingRoads = placementResult.buildings.get('road') || []
        const allRoads = [...existingRoads, ...bunkerRoads]

        // Build roads set
        const roads = new Map<string, number>()
        for (const road of allRoads) {
            roads.set(`${road.x},${road.y}`, 1)
        }

        // Get all obstacles from bunker
        const allObstacles = buildObstacles(placementResult.buildings, roomName)
        // Convert to Set without room prefix for single-room pathfinding
        const obstacleArray = Array.from(allObstacles).map((obs) => {
            const match = obs.match(/:(\d+),(\d+)/)
            return match ? `${match[1]},${match[2]}` : obs
        })

        console.log(`\n[W1N8 Minimal Obstacle Search]`)
        console.log(`  Total obstacles: ${obstacleArray.length}`)
        console.log(`  Total roads: ${allRoads.length}`)

        const startPosition = storageLinkWorld
        const northGoals = [
            { x: 10, y: 1 },
            { x: 11, y: 1 },
            { x: 12, y: 1 },
        ]

        console.log(`  Start: Storage Link Hauler at (${startPosition.x}, ${startPosition.y})`)
        console.log(`  Goal: North boundary (y=1)`)

        // Helper function to test pathfinding with a set of obstacles
        const testPathfinding = (obstacles: Set<string>): boolean => {
            const baseCost = createTerrainCostCallback(mockTerrain)
            const costWithRoads = withPreferred(baseCost, roads)
            const costWithObstacles = withObstacles(costWithRoads, obstacles)

            const path = findPath(startPosition, northGoals, costWithObstacles, {
                range: 1,
                roomSize: 50,
            })

            return path !== undefined && path.length > 0
        }

        // Shuffle obstacles randomly
        for (let i = obstacleArray.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1))
            ;[obstacleArray[i], obstacleArray[j]] = [obstacleArray[j], obstacleArray[i]]
        }

        // Binary search for minimal set: add obstacles one by one until it breaks
        console.log(`  Adding obstacles until pathfinding breaks...`)
        const breakingObstacles: string[] = []

        for (const obstacle of obstacleArray) {
            breakingObstacles.push(obstacle)
            const testSet = new Set(breakingObstacles)

            if (!testPathfinding(testSet)) {
                console.log(
                    `  Pathfinding broke after adding ${breakingObstacles.length} obstacles`,
                )
                break
            }
        }

        // Now find minimal subset - remove obstacles one by one and see if it still breaks
        console.log(`  Finding minimal subset...`)
        let minimalObstacles = [...breakingObstacles]
        let iteration = 1

        // Keep iterating until we can't reduce the set anymore
        while (true) {
            console.log(`  Iteration ${iteration}: Testing ${minimalObstacles.length} obstacles`)
            let removedCount = 0

            for (let i = minimalObstacles.length - 1; i >= 0; i--) {
                const testObstacles = minimalObstacles.filter((_, idx) => idx !== i)
                const testSet = new Set(testObstacles)

                if (!testPathfinding(testSet)) {
                    // Still broken without this obstacle, so it's not needed
                    minimalObstacles = testObstacles
                    removedCount++
                }
            }

            console.log(`  Iteration ${iteration}: Removed ${removedCount} obstacles`)

            if (removedCount === 0) {
                // No more obstacles can be removed
                console.log(`  Converged to minimal set after ${iteration} iteration(s)`)
                break
            }

            iteration++
        }

        console.log(`\n  MINIMAL OBSTACLE SET (${minimalObstacles.length} obstacles):`)
        for (const obs of minimalObstacles) {
            const match = obs.match(/(\d+),(\d+)/)
            if (match) {
                const x = parseInt(match[1])
                const y = parseInt(match[2])
                // Find what building type this is
                let type = 'unknown'
                for (const [buildingType, positions] of placementResult.buildings.entries()) {
                    if (positions.some((p) => p.x === x && p.y === y)) {
                        type = buildingType
                        break
                    }
                }
                console.log(`    (${x}, ${y}) - ${type}`)
            }
        }

        // Cleanup
        delete (global as any).Game

        // Verify the minimal set actually breaks pathfinding
        const finalTest = new Set(minimalObstacles)
        const baseCost = createTerrainCostCallback(mockTerrain)
        const costWithRoads = withPreferred(baseCost, roads)
        const costWithMinimalObstacles = withObstacles(costWithRoads, finalTest)
        const finalPath = findPath(startPosition, northGoals, costWithMinimalObstacles, {
            range: 1,
            roomSize: 50,
        })

        assert.isTrue(
            finalPath === undefined || finalPath.length === 0,
            `Minimal obstacle set should block pathfinding (found ${minimalObstacles.length} obstacles)`,
        )
    })

    it.skip('should fail with minimal W1N8 obstacle set (regression test)', function () {
        // NOTE: This test is obsolete - it was based on ramparts being incorrectly treated as obstacles
        // The hardcoded 40 obstacles included ramparts, which should not block movement
        // Keeping this skipped as historical reference for the debugging process

        const roomName = 'W1N8'
        const baseTerrainData = require('../../fixtures/terrain/W1N8.json')

        const baseFixture = baseTerrainData as {
            terrain: number[][]
            sources: { x: number; y: number }[]
            controller: { x: number; y: number }
            minerals: { x: number; y: number; mineralType: string }[]
        }

        const mockTerrain = new MockRoomTerrain(baseFixture.terrain)

        // Setup global Game mock
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ;(global as any).Game = {
            map: {
                getRoomTerrain: (rName: string) => {
                    if (rName === roomName) {
                        return mockTerrain
                    }
                    const terrain: number[][] = []
                    for (let y = 0; y < 50; y++) {
                        terrain[y] = []
                        for (let x = 0; x < 50; x++) {
                            terrain[y][x] = 1
                        }
                    }
                    return new MockRoomTerrain(terrain)
                },
            },
        }

        // Minimal obstacle set (40 obstacles) that blocks north pathfinding
        // Format: [x, y]
        const minimalObstacles = [
            [16, 34],
            [13, 35],
            [11, 25],
            [14, 35],
            [13, 26],
            [9, 31],
            [10, 32],
            [15, 27],
            [15, 29],
            [8, 29],
            [9, 29],
            [11, 34],
            [11, 33],
            [10, 33],
            [16, 29],
            [9, 25],
            [8, 30],
            [13, 36],
            [11, 35],
            [9, 28],
            [9, 27],
            [16, 33],
            [10, 31],
            [16, 30],
            [15, 28],
            [15, 33],
            [15, 32],
            [14, 26],
            [10, 25],
            [15, 31],
            [12, 36],
            [16, 35],
            [11, 36],
            [14, 27],
            [15, 35],
            [16, 31],
            [9, 26],
            [8, 31],
            [11, 26],
            [12, 26],
        ]

        console.log(`\n[W1N8 Minimal Obstacle Regression Test]`)
        console.log(`  Testing with ${minimalObstacles.length} minimal obstacles`)

        // Visualize the obstacle layout
        const renderGrid = (
            obstacles: number[][],
            start: { x: number; y: number },
            goals: Array<{ x: number; y: number }>,
        ) => {
            const minX = 7
            const maxX = 17
            const minY = 24
            const maxY = 37

            console.log(`\n  Grid visualization (x: ${minX}-${maxX}, y: ${minY}-${maxY}):`)
            console.log(`  Legend: S=Start(${start.x},${start.y}) X=Obstacle .=Open G=Goal\n`)

            // Build obstacle lookup
            const obstacleSet = new Set<string>()
            for (const obs of obstacles) {
                obstacleSet.add(`${obs[0]},${obs[1]}`)
            }

            // Build goal lookup
            const goalSet = new Set<string>()
            for (const g of goals) {
                goalSet.add(`${g.x},${g.y}`)
            }

            // Header with x coordinates
            let header = '     '
            for (let x = minX; x <= maxX; x++) {
                header += x.toString().padStart(2, ' ')
            }
            console.log(header)

            // Render each row
            for (let y = minY; y <= maxY; y++) {
                let row = `y=${y.toString().padStart(2, ' ')} `
                for (let x = minX; x <= maxX; x++) {
                    const key = `${x},${y}`
                    if (x === start.x && y === start.y) {
                        row += ' S'
                    } else if (goalSet.has(key)) {
                        row += ' G'
                    } else if (obstacleSet.has(key)) {
                        row += ' X'
                    } else {
                        row += ' .'
                    }
                }
                console.log(row)
            }
            console.log('')
        }

        // Storage link hauler position from W1N8 bunker placement
        const startPosition = { x: 12, y: 29 }
        const northGoals = [
            { x: 10, y: 1 },
            { x: 11, y: 1 },
            { x: 12, y: 1 },
        ]

        // Render the grid
        renderGrid(minimalObstacles, startPosition, northGoals)

        // Convert to obstacle set
        const obstacles = new Set<string>()
        for (const [x, y] of minimalObstacles) {
            obstacles.add(`${x},${y}`)
        }

        // Create roads map (empty for this simplified test)
        const roads = new Map<string, number>()

        const baseCost = createTerrainCostCallback(mockTerrain)
        const costWithRoads = withPreferred(baseCost, roads)
        const costWithObstacles = withObstacles(costWithRoads, obstacles)

        const path = findPath(startPosition, northGoals, costWithObstacles, {
            range: 1,
            roomSize: 50,
        })

        console.log(
            `  Result: ${path ? `Found path with ${path.length} steps` : 'NULL - NO PATH FOUND'}`,
        )

        // Cleanup
        delete (global as any).Game

        // This test documents the pathfinding failure with minimal obstacles
        // The bunker placement creates a situation where diagonal corner-crossing is blocked
        assert.isTrue(
            path === undefined || path.length === 0,
            'Pathfinding should fail with minimal obstacle set (demonstrates bunker layout issue)',
        )
    })

    it.skip('should verify each obstacle in minimal set is necessary', function () {
        // NOTE: This test is obsolete - it was validating a minimal set that included ramparts
        // Ramparts should not be obstacles, so this validation is no longer meaningful
        // Keeping this skipped as historical reference for the debugging process

        this.timeout(30000) // Increase timeout for 40 pathfinding tests

        const roomName = 'W1N8'
        const baseTerrainData = require('../../fixtures/terrain/W1N8.json')

        const baseFixture = baseTerrainData as {
            terrain: number[][]
            sources: { x: number; y: number }[]
            controller: { x: number; y: number }
            minerals: { x: number; y: number; mineralType: string }[]
        }

        const mockTerrain = new MockRoomTerrain(baseFixture.terrain)

        // Setup global Game mock
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ;(global as any).Game = {
            map: {
                getRoomTerrain: (rName: string) => {
                    if (rName === roomName) {
                        return mockTerrain
                    }
                    const terrain: number[][] = []
                    for (let y = 0; y < 50; y++) {
                        terrain[y] = []
                        for (let x = 0; x < 50; x++) {
                            terrain[y][x] = 1
                        }
                    }
                    return new MockRoomTerrain(terrain)
                },
            },
        }

        // Minimal obstacle set (same as regression test)
        const minimalObstacles = [
            [16, 34],
            [13, 35],
            [11, 25],
            [14, 35],
            [13, 26],
            [9, 31],
            [10, 32],
            [15, 27],
            [15, 29],
            [8, 29],
            [9, 29],
            [11, 34],
            [11, 33],
            [10, 33],
            [16, 29],
            [9, 25],
            [8, 30],
            [13, 36],
            [11, 35],
            [9, 28],
            [9, 27],
            [16, 33],
            [10, 31],
            [16, 30],
            [15, 28],
            [15, 33],
            [15, 32],
            [14, 26],
            [10, 25],
            [15, 31],
            [12, 36],
            [16, 35],
            [11, 36],
            [14, 27],
            [15, 35],
            [16, 31],
            [9, 26],
            [8, 31],
            [11, 26],
            [12, 26],
        ]

        console.log(`\n[W1N8 Minimal Set Validation]`)
        console.log(
            `  Testing that removing any of ${minimalObstacles.length} obstacles allows pathfinding...`,
        )

        // Storage link hauler position from W1N8 bunker placement
        const startPosition = { x: 12, y: 29 }
        const northGoals = [
            { x: 10, y: 1 },
            { x: 11, y: 1 },
            { x: 12, y: 1 },
        ]

        console.log(`  Start: Storage Link Hauler at (${startPosition.x}, ${startPosition.y})`)
        console.log(`  Goal: North boundary (y=1)`)

        const roads = new Map<string, number>()

        let necessaryCount = 0
        const redundantObstacles: Array<{ index: number; position: [number, number] }> = []

        for (let i = 0; i < minimalObstacles.length; i++) {
            // Remove obstacle i from the set
            const testObstacles = minimalObstacles.filter((_, idx) => idx !== i)
            const obstacles = new Set<string>()
            for (const [x, y] of testObstacles) {
                obstacles.add(`${x},${y}`)
            }

            // Test pathfinding with obstacle i removed
            const baseCost = createTerrainCostCallback(mockTerrain)
            const costWithRoads = withPreferred(baseCost, roads)
            const costWithObstacles = withObstacles(costWithRoads, obstacles)

            const path = findPath(startPosition, northGoals, costWithObstacles, {
                range: 1,
                roomSize: 50,
            })

            if (path && path.length > 0) {
                // Pathfinding succeeded - obstacle i was necessary
                necessaryCount++
            } else {
                // Pathfinding still failed - obstacle i is redundant
                redundantObstacles.push({
                    index: i,
                    position: minimalObstacles[i] as [number, number],
                })
            }
        }

        console.log(
            `  Results: ${necessaryCount}/${minimalObstacles.length} obstacles are necessary`,
        )

        if (redundantObstacles.length > 0) {
            console.log(`  Found ${redundantObstacles.length} redundant obstacle(s):`)
            for (const obs of redundantObstacles) {
                console.log(`    Index ${obs.index}: (${obs.position[0]}, ${obs.position[1]})`)
            }
        } else {
            console.log(`  All obstacles are necessary - set is truly minimal!`)
        }

        // Cleanup
        delete (global as any).Game

        // All obstacles should be necessary for a truly minimal set
        assert.equal(
            necessaryCount,
            minimalObstacles.length,
            `All ${minimalObstacles.length} obstacles should be necessary. Found ${
                redundantObstacles.length
            } redundant obstacles at indices: ${redundantObstacles.map((o) => o.index).join(', ')}`,
        )
    })
})
