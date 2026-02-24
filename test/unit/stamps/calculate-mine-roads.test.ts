import { assert } from 'chai'
import { calculateMineRoads } from '../../../src/stamps/mine-roads'

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

describe('calculateMineRoads', () => {
    beforeEach(() => {
        // Mock Game.map.getRoomTerrain
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
                    return new MockRoomTerrain(terrain)
                },
            },
        }

        // Mock Memory
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ;(global as any).Memory = {
            rooms: {
                E53S29: {
                    scout: {
                        sourcePositions: {
                            '0': { x: 10, y: 10 },
                        },
                    },
                },
            },
        }
    })

    afterEach(() => {
        // Clean up global mocks
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        delete (global as any).Game
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        delete (global as any).Memory
    })

    it('s2s path endpoints should align with storage path endpoints', () => {
        // Set up a mine with 2 sources using IDs that sort predictably
        // sortedIds[0] = 'aaa' (source1), sortedIds[1] = 'zzz' (source2)
        ;(global as any).Memory = {
            rooms: {
                E53S29: {
                    scout: {
                        sourcePositions: {
                            aaa: { x: 10, y: 10 },
                            zzz: { x: 40, y: 10 },
                        },
                    },
                },
            },
        }

        const results = calculateMineRoads(
            'E52S29',
            { x: 25, y: 25 },
            [{ name: 'E53S29' }],
            new Map(),
        )

        assert.equal(results.length, 1, 'Should calculate roads for the mine')
        const result = results[0]

        assert.isNotNull(result.sourceToSourcePath, 'Should have a source-to-source path')
        const s2sPath = result.sourceToSourcePath!

        const sortedIds = Object.keys(result.sourcePaths).sort()
        assert.equal(sortedIds.length, 2, 'Should have paths for both sources')

        const source1Path = result.sourcePaths[sortedIds[0]]
        const source2Path = result.sourcePaths[sortedIds[1]]

        const s2sFirst = s2sPath[0]
        const s2sLast = s2sPath[s2sPath.length - 1]
        // Pickup point = second-to-last of each source's full path (stationary point excluded)
        const source1Pickup = source1Path[source1Path.length - 2]
        const source2Pickup = source2Path[source2Path.length - 2]

        // Forward: s2s ends at pickup2 so the hauler is correctly placed after source1→source2
        assert.equal(
            s2sLast.x,
            source2Pickup.x,
            `s2sPath last x (${s2sLast.x}) should equal source2 pickup x (${source2Pickup.x})`,
        )
        assert.equal(
            s2sLast.y,
            source2Pickup.y,
            `s2sPath last y (${s2sLast.y}) should equal source2 pickup y (${source2Pickup.y})`,
        )

        // Reverse: s2s starts at pickup1 so the hauler is correctly placed for source2→source1
        assert.equal(
            s2sFirst.x,
            source1Pickup.x,
            `s2sPath first x (${s2sFirst.x}) should equal source1 pickup x (${source1Pickup.x})`,
        )
        assert.equal(
            s2sFirst.y,
            source1Pickup.y,
            `s2sPath first y (${s2sFirst.y}) should equal source1 pickup y (${source1Pickup.y})`,
        )
    })

    it('should not place roads on top of bunker structures like extensions', () => {
        // Create a bunker with roads and extensions at the same positions
        const baseBunkerBuildings = new Map<string, { x: number; y: number }[]>()

        // Add some roads
        baseBunkerBuildings.set('road', [
            { x: 26, y: 25 },
            { x: 27, y: 25 },
            { x: 28, y: 25 },
        ])

        // Add extensions at some of the same positions as roads
        // (simulating bunker design where roads and structures overlap)
        baseBunkerBuildings.set('extension', [
            { x: 27, y: 25 }, // This overlaps with a road!
            { x: 30, y: 20 },
        ])

        // Add tower
        baseBunkerBuildings.set('tower', [{ x: 30, y: 25 }])

        const mines = [{ name: 'E53S29', distance: 1 }]

        const results = calculateMineRoads('E52S29', { x: 25, y: 25 }, mines, baseBunkerBuildings)

        assert.equal(results.length, 1, 'Should calculate roads for one mine')

        const result = results[0]

        // Check that roads don't include the extension position (27, 25)
        const roadsOnExtension = result.minerRoads.filter(
            (r: { x: number; y: number }) => r.x === 27 && r.y === 25,
        )

        assert.equal(
            roadsOnExtension.length,
            0,
            'Should not place mine roads on positions with extensions, even if those positions have bunker roads',
        )

        // Check that roads don't include the tower position (30, 25)
        const roadsOnTower = result.minerRoads.filter(
            (r: { x: number; y: number }) => r.x === 30 && r.y === 25,
        )

        assert.equal(roadsOnTower.length, 0, 'Should not place mine roads on positions with towers')
    })
})
