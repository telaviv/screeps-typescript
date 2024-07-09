import { expect } from 'chai'

import { distanceTransform } from '../../../src/room-analysis/distance-transform'
import { Position } from '../../../src/types'
import exp from 'constants'

class RoomTerrain {
    private walls = new Set<string>()

    get(x: number, y: number): 0 | 1 {
        if (this.walls.has(`${x}:${y}`)) {
            return 1
        }
        return 0
    }

    addWall(x: number, y: number): void {
        this.walls.add(`${x}:${y}`)
    }
}

describe.only('distanceTransform', () => {
    it('should return all infinity if the position array is empty', () => {
        const roomTerrain = new RoomTerrain()
        const positions: Position[] = []
        const result = distanceTransform(roomTerrain, positions)
        for (let x = 0; x < 50; x++) {
            for (let y = 0; y < 50; y++) {
                expect(result[x][y]).to.equal(Infinity)
            }
        }
    })

    it('should calculate the distance transform for a single position', () => {
        const roomTerrain = new RoomTerrain()
        const positions: Position[] = [{ x: 0, y: 0 }]
        const result = distanceTransform(roomTerrain, positions)
        expect(result[0][0]).to.equal(0)
        expect(result[1][1]).to.equal(1)
        expect(result[49][49]).to.equal(49)
    })

    it('should calculate the distance transform with walls in the way', () => {
        const roomTerrain = new RoomTerrain()
        roomTerrain.addWall(1, 0)
        roomTerrain.addWall(1, 1)
        const positions: Position[] = [{ x: 0, y: 0 }]
        const result = distanceTransform(roomTerrain, positions)
        expect(result[0][0]).to.equal(0)
        expect(result[1][1]).to.equal(Infinity)
        expect(result[2][0]).to.equal(4)
    })

    it('should calculate the distance transform with multiple positions', () => {
        const roomTerrain = new RoomTerrain()
        const positions: Position[] = [
            { x: 1, y: 1 },
            { x: 2, y: 1 },
        ]
        const result = distanceTransform(roomTerrain, positions)
        expect(result[0][0]).to.equal(1)
        expect(result[1][0]).to.equal(1)
        expect(result[1][1]).to.equal(0)
        expect(result[49][49]).to.equal(48)
    })
})
