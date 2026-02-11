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
