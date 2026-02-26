import { expect } from 'chai'

import { ConstructionFeatures } from '../../../src/construction-features'
import { RoadGraph } from '../../../src/types'
import { astar, buildRoadGraph, findPathOnRoadGraph } from '../../../src/utils/road-graph'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function features(
    roads: { x: number; y: number }[],
    structures: Partial<ConstructionFeatures> = {},
): ConstructionFeatures {
    return { [STRUCTURE_ROAD]: roads, ...structures }
}

function graphKey(x: number, y: number): string {
    return `${x},${y}`
}

// ---------------------------------------------------------------------------
// buildRoadGraph
// ---------------------------------------------------------------------------

describe('buildRoadGraph', () => {
    describe('single node', () => {
        it('creates one node with empty neighbors and structures', () => {
            const graph = buildRoadGraph(features([{ x: 5, y: 5 }]))
            expect(graph.nodes).to.have.key('5,5')
            expect(graph.nodes['5,5'].neighbors).to.deep.equal([])
            expect(graph.nodes['5,5'].structures).to.deep.equal([])
        })

        it('has no obstacle entries when nothing is adjacent', () => {
            const graph = buildRoadGraph(features([{ x: 5, y: 5 }]))
            expect(Object.keys(graph.obstacles)).to.have.length(0)
        })
    })

    describe('linear chain of roads', () => {
        // roads: (10,10) — (11,10) — (12,10)
        const graph = buildRoadGraph(
            features([
                { x: 10, y: 10 },
                { x: 11, y: 10 },
                { x: 12, y: 10 },
            ]),
        )

        it('creates three nodes', () => {
            expect(Object.keys(graph.nodes)).to.have.length(3)
        })

        it('middle node has two neighbors', () => {
            expect(graph.nodes['11,10'].neighbors).to.include('10,10')
            expect(graph.nodes['11,10'].neighbors).to.include('12,10')
        })

        it('end nodes have exactly one road neighbor', () => {
            expect(graph.nodes['10,10'].neighbors).to.deep.equal(['11,10'])
            expect(graph.nodes['12,10'].neighbors).to.deep.equal(['11,10'])
        })
    })

    describe('diagonal adjacency', () => {
        it('includes diagonally adjacent roads as neighbors', () => {
            const graph = buildRoadGraph(
                features([
                    { x: 5, y: 5 },
                    { x: 6, y: 6 },
                ]),
            )
            expect(graph.nodes['5,5'].neighbors).to.include('6,6')
            expect(graph.nodes['6,6'].neighbors).to.include('5,5')
        })
    })

    describe('adjacent structures', () => {
        it('records a single adjacent extension in node.structures', () => {
            const graph = buildRoadGraph(
                features([{ x: 5, y: 5 }], {
                    [STRUCTURE_EXTENSION]: [{ x: 5, y: 6 }],
                }),
            )
            expect(graph.nodes['5,5'].structures).to.include(STRUCTURE_EXTENSION)
        })

        it('records multiple structure types when several are adjacent', () => {
            const graph = buildRoadGraph(
                features([{ x: 5, y: 5 }], {
                    [STRUCTURE_EXTENSION]: [{ x: 5, y: 6 }],
                    [STRUCTURE_STORAGE]: [{ x: 6, y: 5 }],
                }),
            )
            expect(graph.nodes['5,5'].structures).to.include(STRUCTURE_EXTENSION)
            expect(graph.nodes['5,5'].structures).to.include(STRUCTURE_STORAGE)
        })

        it('does not duplicate structure types', () => {
            const graph = buildRoadGraph(
                features([{ x: 5, y: 5 }], {
                    [STRUCTURE_EXTENSION]: [
                        { x: 5, y: 6 },
                        { x: 6, y: 5 },
                    ],
                }),
            )
            const extCount = graph.nodes['5,5'].structures.filter(
                (s) => s === STRUCTURE_EXTENSION,
            ).length
            expect(extCount).to.equal(1)
        })

        it('road with no adjacent structures has empty structures array', () => {
            const graph = buildRoadGraph(features([{ x: 5, y: 5 }]))
            expect(graph.nodes['5,5'].structures).to.deep.equal([])
        })

        it('does not include STRUCTURE_ROAD itself in structures', () => {
            const graph = buildRoadGraph(
                features([
                    { x: 5, y: 5 },
                    { x: 6, y: 5 },
                ]),
            )
            expect(graph.nodes['5,5'].structures).to.not.include(STRUCTURE_ROAD)
        })
    })
})

// ---------------------------------------------------------------------------
// obstacles inverse index
// ---------------------------------------------------------------------------

describe('buildRoadGraph obstacles index', () => {
    it('creates an obstacle entry for an adjacent structure', () => {
        const graph = buildRoadGraph(
            features([{ x: 5, y: 5 }], {
                [STRUCTURE_EXTENSION]: [{ x: 5, y: 6 }],
            }),
        )
        expect(graph.obstacles).to.have.key('5,6')
        expect(graph.obstacles['5,6'].type).to.equal(STRUCTURE_EXTENSION)
    })

    it('lists the adjacent road key in obstacle.roads', () => {
        const graph = buildRoadGraph(
            features([{ x: 5, y: 5 }], {
                [STRUCTURE_EXTENSION]: [{ x: 5, y: 6 }],
            }),
        )
        expect(graph.obstacles['5,6'].roads).to.include('5,5')
    })

    it('lists all adjacent roads when multiple roads are range-1 to the same obstacle', () => {
        const graph = buildRoadGraph(
            features(
                [
                    { x: 5, y: 5 },
                    { x: 6, y: 5 },
                ],
                {
                    [STRUCTURE_EXTENSION]: [{ x: 5, y: 6 }],
                },
            ),
        )
        expect(graph.obstacles['5,6'].roads).to.include('5,5')
        expect(graph.obstacles['5,6'].roads).to.include('6,5')
    })

    it('does not include roads in the obstacles index', () => {
        const graph = buildRoadGraph(
            features([
                { x: 5, y: 5 },
                { x: 6, y: 5 },
            ]),
        )
        expect(graph.obstacles).to.not.have.key('5,5')
        expect(graph.obstacles).to.not.have.key('6,5')
    })

    it('does not create an obstacle entry for a structure with no adjacent roads', () => {
        const graph = buildRoadGraph(
            features([{ x: 5, y: 5 }], {
                [STRUCTURE_EXTENSION]: [{ x: 20, y: 20 }],
            }),
        )
        expect(graph.obstacles).to.not.have.key('20,20')
    })

    it('does not duplicate road keys in obstacle.roads', () => {
        const graph = buildRoadGraph(
            features([{ x: 5, y: 5 }], {
                [STRUCTURE_EXTENSION]: [{ x: 5, y: 6 }],
            }),
        )
        const unique = new Set(graph.obstacles['5,6'].roads)
        expect(unique.size).to.equal(graph.obstacles['5,6'].roads.length)
    })
})

// ---------------------------------------------------------------------------
// astar
// ---------------------------------------------------------------------------

describe('astar', () => {
    function makeLinearGraph(length: number): RoadGraph {
        const roads = Array.from({ length }, (_, i) => ({ x: i, y: 0 }))
        return buildRoadGraph(features(roads))
    }

    it('returns null when targetKeys is empty', () => {
        const graph = makeLinearGraph(3)
        expect(astar(graph, '0,0', new Set())).to.be.null
    })

    it('returns null when startKey is not in the graph', () => {
        const graph = makeLinearGraph(3)
        expect(astar(graph, '99,99', new Set(['0,0']))).to.be.null
    })

    it('returns [startKey] when start is already a target', () => {
        const graph = makeLinearGraph(3)
        const path = astar(graph, '1,0', new Set(['1,0']))
        expect(path).to.deep.equal(['1,0'])
    })

    it('finds direct path along a linear road', () => {
        const graph = makeLinearGraph(5)
        const path = astar(graph, '0,0', new Set(['4,0']))
        expect(path).to.not.be.null
        expect(path![0]).to.equal('0,0')
        expect(path![path!.length - 1]).to.equal('4,0')
        expect(path!.length).to.equal(5)
    })

    it('finds path along an L-shaped road', () => {
        // Road: (0,0)→(1,0)→(2,0)→(2,1)→(2,2)
        const graph = buildRoadGraph(
            features([
                { x: 0, y: 0 },
                { x: 1, y: 0 },
                { x: 2, y: 0 },
                { x: 2, y: 1 },
                { x: 2, y: 2 },
            ]),
        )
        const path = astar(graph, '0,0', new Set(['2,2']))
        expect(path).to.not.be.null
        expect(path![0]).to.equal('0,0')
        expect(path![path!.length - 1]).to.equal('2,2')
    })

    it('returns null for disconnected graph', () => {
        // Two separate road segments with no connection
        const graph = buildRoadGraph(
            features([
                { x: 0, y: 0 },
                { x: 1, y: 0 },
                { x: 10, y: 10 },
                { x: 11, y: 10 },
            ]),
        )
        expect(astar(graph, '0,0', new Set(['10,10']))).to.be.null
    })

    it('finds path to the nearest of multiple targets by road distance', () => {
        // Linear road 0..9, target at 2,0 and 8,0; start at 0,0
        // Nearest by road is 2,0 (2 hops) vs 8,0 (8 hops)
        const roads = Array.from({ length: 10 }, (_, i) => ({ x: i, y: 0 }))
        const graph = buildRoadGraph(features(roads))
        const path = astar(graph, '0,0', new Set(['2,0', '8,0']))
        expect(path).to.not.be.null
        expect(path![path!.length - 1]).to.equal('2,0')
    })

    it('path visits nodes in order (no teleporting)', () => {
        const graph = makeLinearGraph(5)
        const path = astar(graph, '0,0', new Set(['4,0']))!
        for (let i = 1; i < path.length; i++) {
            const [px, py] = path[i - 1].split(',').map(Number)
            const [cx, cy] = path[i].split(',').map(Number)
            const dist = Math.max(Math.abs(cx - px), Math.abs(cy - py))
            expect(dist).to.equal(1)
        }
    })

    it('returns target key not in graph nodes as null', () => {
        const graph = makeLinearGraph(3)
        expect(astar(graph, '0,0', new Set(['99,99']))).to.be.null
    })
})

// ---------------------------------------------------------------------------
// findPathOnRoadGraph
// ---------------------------------------------------------------------------

describe('findPathOnRoadGraph', () => {
    it('returns null when no node has the target structure type', () => {
        const graph = buildRoadGraph(features([{ x: 5, y: 5 }]))
        const result = findPathOnRoadGraph(graph, { x: 5, y: 5 }, STRUCTURE_EXTENSION)
        expect(result).to.be.null
    })

    it('returns a path when start is on a road node adjacent to the target structure', () => {
        const graph = buildRoadGraph(
            features([{ x: 5, y: 5 }], {
                [STRUCTURE_EXTENSION]: [{ x: 5, y: 6 }],
            }),
        )
        const result = findPathOnRoadGraph(graph, { x: 5, y: 5 }, STRUCTURE_EXTENSION)
        expect(result).to.not.be.null
        expect(result).to.deep.equal([{ x: 5, y: 5 }])
    })

    it('finds a path along roads to reach a storage node', () => {
        // Road: (0,0)→(1,0)→(2,0)  storage at (2,1)
        // Both (1,0) and (2,0) are Chebyshev-1 adjacent to storage; A* stops at the nearest.
        const graph = buildRoadGraph(
            features(
                [
                    { x: 0, y: 0 },
                    { x: 1, y: 0 },
                    { x: 2, y: 0 },
                ],
                {
                    [STRUCTURE_STORAGE]: [{ x: 2, y: 1 }],
                },
            ),
        )
        const result = findPathOnRoadGraph(graph, { x: 0, y: 0 }, STRUCTURE_STORAGE)
        expect(result).to.not.be.null
        expect(result![0]).to.deep.equal({ x: 0, y: 0 })
        const lastPos = result![result!.length - 1]
        const lastKey = graphKey(lastPos.x, lastPos.y)
        expect(graph.nodes[lastKey].structures).to.include(STRUCTURE_STORAGE)
    })

    it('snaps an off-road start to the nearest road node', () => {
        // Road at (10,10), start at (10,12) — nearest road is (10,10)
        const graph = buildRoadGraph(
            features([{ x: 10, y: 10 }], {
                [STRUCTURE_EXTENSION]: [{ x: 10, y: 9 }],
            }),
        )
        const result = findPathOnRoadGraph(graph, { x: 10, y: 12 }, STRUCTURE_EXTENSION)
        expect(result).to.not.be.null
        expect(result).to.deep.equal([{ x: 10, y: 10 }])
    })

    it('snaps to the nearest road node when multiple roads exist', () => {
        // Roads at (0,0) and (10,0); start off-road at (9,0); nearest road is (10,0)
        const graph = buildRoadGraph(
            features(
                [
                    { x: 0, y: 0 },
                    { x: 10, y: 0 },
                ],
                {
                    [STRUCTURE_EXTENSION]: [{ x: 10, y: 1 }],
                },
            ),
        )
        // Start at (9,0) is 1 away from (10,0) and 9 away from (0,0)
        const result = findPathOnRoadGraph(graph, { x: 9, y: 0 }, STRUCTURE_EXTENSION)
        expect(result).to.not.be.null
        expect(result).to.deep.equal([{ x: 10, y: 0 }])
    })

    it('returns null when the graph has no nodes', () => {
        const graph = buildRoadGraph(features([]))
        const result = findPathOnRoadGraph(graph, { x: 5, y: 5 }, STRUCTURE_EXTENSION)
        expect(result).to.be.null
    })

    it('returns positions with correct x/y coordinates', () => {
        // Roads (3,7)→(4,7)→(5,7), storage at (5,8); both (4,7) and (5,7) are adjacent.
        const graph = buildRoadGraph(
            features(
                [
                    { x: 3, y: 7 },
                    { x: 4, y: 7 },
                    { x: 5, y: 7 },
                ],
                {
                    [STRUCTURE_STORAGE]: [{ x: 5, y: 8 }],
                },
            ),
        )
        const result = findPathOnRoadGraph(graph, { x: 3, y: 7 }, STRUCTURE_STORAGE)
        expect(result).to.not.be.null
        for (const pos of result!) {
            expect(pos).to.have.keys('x', 'y')
            expect(pos.x).to.be.a('number')
            expect(pos.y).to.be.a('number')
        }
        const lastPos = result![result!.length - 1]
        const lastKey = graphKey(lastPos.x, lastPos.y)
        expect(graph.nodes[lastKey].structures).to.include(STRUCTURE_STORAGE)
    })

    it('works with containers as target type', () => {
        const graph = buildRoadGraph(
            features([{ x: 5, y: 5 }], {
                [STRUCTURE_CONTAINER]: [{ x: 6, y: 5 }],
            }),
        )
        const result = findPathOnRoadGraph(graph, { x: 5, y: 5 }, STRUCTURE_CONTAINER)
        expect(result).to.not.be.null
    })

    it('returns null when target structure is unreachable (disconnected)', () => {
        const graph = buildRoadGraph(
            features(
                [
                    { x: 0, y: 0 },
                    { x: 20, y: 20 },
                ],
                {
                    [STRUCTURE_EXTENSION]: [{ x: 21, y: 20 }],
                },
            ),
        )
        // Start at (0,0) — the extension is adjacent to (20,20) but the roads are not connected
        const result = findPathOnRoadGraph(graph, { x: 0, y: 0 }, STRUCTURE_EXTENSION)
        expect(result).to.be.null
    })

    it('graphKey helper produces expected format', () => {
        expect(graphKey(3, 7)).to.equal('3,7')
    })
})
