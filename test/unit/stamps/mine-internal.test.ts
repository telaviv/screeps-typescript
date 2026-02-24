import { assert } from 'chai'
import { calculateMineInternal } from '../../../src/stamps/mine-internal'

class MockRoomTerrain {
    private terrain: number[][]

    constructor(terrain: number[][]) {
        this.terrain = terrain
    }

    get(x: number, y: number): number {
        if (x < 0 || x >= 50 || y < 0 || y >= 50) {
            return 1
        }
        return this.terrain[y][x]
    }
}

function makePlainTerrain(): MockRoomTerrain {
    const terrain: number[][] = []
    for (let y = 0; y < 50; y++) {
        terrain[y] = []
        for (let x = 0; x < 50; x++) {
            terrain[y][x] = 0
        }
    }
    return new MockRoomTerrain(terrain)
}

describe('calculateMineInternal', () => {
    beforeEach(() => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ;(global as any).Game = {
            map: {
                getRoomTerrain: () => makePlainTerrain(),
            },
        }
    })

    afterEach(() => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        delete (global as any).Game
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        delete (global as any).Memory
    })

    it('no road tile should coincide with a container (stationary point) for a 1-source mine', () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ;(global as any).Memory = {
            rooms: {
                E53S29: { scout: { sourcePositions: { aaa: { x: 20, y: 20 } } } },
            },
        }

        const result = calculateMineInternal('E53S29', { x: 0, y: 25, roomName: 'E53S29' })
        assert.isNotNull(result)

        const containerKeys = new Set(
            result!.features[STRUCTURE_CONTAINER]!.map((p) => `${p.x},${p.y}`),
        )
        for (const road of result!.features[STRUCTURE_ROAD]!) {
            assert.isFalse(
                containerKeys.has(`${road.x},${road.y}`),
                `Road at (${road.x},${road.y}) overlaps with a container (stationary miner position)`,
            )
        }
    })

    it('no road tile should coincide with a container (stationary point) for a 2-source mine', () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

        const result = calculateMineInternal('E53S29', { x: 0, y: 10, roomName: 'E53S29' })
        assert.isNotNull(result)

        const containerKeys = new Set(
            result!.features[STRUCTURE_CONTAINER]!.map((p) => `${p.x},${p.y}`),
        )
        assert.equal(containerKeys.size, 2, 'Should have 2 containers for 2 sources')

        for (const road of result!.features[STRUCTURE_ROAD]!) {
            assert.isFalse(
                containerKeys.has(`${road.x},${road.y}`),
                `Road at (${road.x},${road.y}) overlaps with a container (stationary miner position)`,
            )
        }
    })

    it("source2's road path should not pass through source1's container", () => {
        // Place both sources along the same horizontal so the naive path to source2
        // would pass directly through source1's container if not blocked.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

        // Entrance at (0, 10) puts both sources directly in line — source1 is at (10,10),
        // source2 is at (40,10). Without obstacle blocking, source2's path would go
        // through container1 (adjacent to source1 = ~(9,10)).
        const result = calculateMineInternal('E53S29', { x: 0, y: 10, roomName: 'E53S29' })
        assert.isNotNull(result)

        // stationary1 is adjacent to aaa=(10,10), somewhere around (9,10)
        const container1 = result!.stationary[`aaa` as Id<Source>]
        assert.isDefined(container1, 'Should have a stationary point for source aaa')

        // Source2's roads are the subset of total roads that lie beyond container1.
        // Regardless, container1 must NOT appear anywhere in the road list.
        const roadAtContainer1 = result!.features[STRUCTURE_ROAD]!.some(
            (r) => r.x === container1.x && r.y === container1.y,
        )
        assert.isFalse(
            roadAtContainer1,
            `Road found at container1 (${container1.x},${container1.y}) — source2's path went through source1's stationary position`,
        )
    })

    it('pickup points should be populated and differ from stationary points', () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

        const result = calculateMineInternal('E53S29', { x: 0, y: 10, roomName: 'E53S29' })
        assert.isNotNull(result)

        for (const sourceId of ['aaa', 'zzz'] as Id<Source>[]) {
            const stat: { x: number; y: number } | undefined = result!.stationary[sourceId]
            const pick: { x: number; y: number } | undefined = result!.pickup[sourceId]
            assert.isDefined(stat, `Should have stationary point for ${sourceId}`)
            assert.isDefined(pick, `Should have pickup point for ${sourceId}`)
            // Pickup must be adjacent to stationary (Chebyshev distance = 1)
            const dist = Math.max(Math.abs(pick.x - stat.x), Math.abs(pick.y - stat.y))
            assert.equal(
                dist,
                1,
                `Pickup (${pick.x},${pick.y}) should be adjacent to stationary (${stat.x},${stat.y})`,
            )
            // Pickup must be a road tile (the hauler stands there)
            const pickupIsRoad = result!.features[STRUCTURE_ROAD]!.some(
                (r) => r.x === pick.x && r.y === pick.y,
            )
            assert.isTrue(pickupIsRoad, `Pickup point (${pick.x},${pick.y}) should be a road tile`)
        }
    })
})
