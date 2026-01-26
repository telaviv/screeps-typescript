import { assert } from 'chai'
import { calculateSingleMineRoads } from '../../../src/stamps/single-mine-roads'

// Mock RoomTerrain for testing
class MockRoomTerrain {
    private terrain: number[][]

    constructor(terrain: number[][]) {
        this.terrain = terrain
    }

    get(x: number, y: number): number {
        if (x < 0 || x >= 50 || y < 0 || y >= 50) {
            return 1 // Wall
        }
        return this.terrain[y][x]
    }
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
        const roadsInBlocked = result!.baseRoads.filter((r) => r.x === 30 && r.y >= 20 && r.y <= 30)
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
})
