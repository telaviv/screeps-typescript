import { expect } from 'chai';
import { minimumSpanningTree } from '../../../src/room-analysis/calculate-road-positions';

describe('minimumSpanningTree', () => {
    it.only('should return the minimum spanning tree of a graph', () => {
        // Define the input graph
        const edges = [
            { a: 'A', b: 'B', weight: 5 },
            { a: 'B', b: 'C', weight: 3 },
            { a: 'C', b: 'D', weight: 2 },
            { a: 'D', b: 'A', weight: 4 },
            { a: 'A', b: 'C', weight: 1 },
        ];
        const vertices = ['A', 'B', 'C', 'D'];

        // Call the function
        const result = minimumSpanningTree(edges, vertices)

        // Assert the result
        expect(result).to.deep.equal([
            { a: 'A', b: 'C', weight: 1 },
            { a: 'C', b: 'D', weight: 2 },
            { a: 'B', b: 'C', weight: 3 },
        ]);
    });

    // Add more test cases if needed
});
