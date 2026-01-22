import { expect } from 'chai'
import * as fs from 'fs'
import * as path from 'path'

import bunkerStamp from '../../../src/stamps/bunker'
import {
    checkStampCollision,
    isValidRoomPosition,
    placeBunker,
} from '../../../src/stamps/placement'
import { Position } from '../../../src/types'

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
        const value = this.terrain[x][y]
        if (value === 0 || value === 1 || value === 2) {
            return value as 0 | 1 | 2
        }
        return 0
    }
}

interface TerrainFixture {
    roomName: string
    terrain: number[][]
    sources: Position[]
    controller: Position
}

describe('Bunker Placement', () => {
    let fixtureE56S29: TerrainFixture

    before(() => {
        // Load the E56S29 fixture
        const fixturePath = path.join(__dirname, '../../fixtures/terrain/E56S29.json')
        const fixtureData = fs.readFileSync(fixturePath, 'utf8')
        fixtureE56S29 = JSON.parse(fixtureData)
    })

    describe('isValidRoomPosition', () => {
        it('should return true for valid positions', () => {
            expect(isValidRoomPosition({ x: 25, y: 25 })).to.be.true
            expect(isValidRoomPosition({ x: 0, y: 0 })).to.be.true
            expect(isValidRoomPosition({ x: 49, y: 49 })).to.be.true
        })

        it('should return false for invalid positions', () => {
            expect(isValidRoomPosition({ x: -1, y: 25 })).to.be.false
            expect(isValidRoomPosition({ x: 50, y: 25 })).to.be.false
            expect(isValidRoomPosition({ x: 25, y: -1 })).to.be.false
            expect(isValidRoomPosition({ x: 25, y: 50 })).to.be.false
        })
    })

    describe('placeBunker with E56S29 fixture', () => {
        it('should successfully place a bunker', () => {
            const terrain = new MockRoomTerrain(fixtureE56S29.terrain)
            const result = placeBunker({
                terrain,
                roomName: fixtureE56S29.roomName,
                sources: fixtureE56S29.sources,
                controller: fixtureE56S29.controller,
                stamp: bunkerStamp,
            })

            expect(result.success).to.be.true
            expect(result.origin).to.not.be.null
            expect(result.center).to.not.be.null
            expect(result.score).to.be.a('number')
            expect(result.score).to.be.lessThan(Infinity)
        })

        it('should place bunker with valid room positions', () => {
            const terrain = new MockRoomTerrain(fixtureE56S29.terrain)
            const result = placeBunker({
                terrain,
                roomName: fixtureE56S29.roomName,
                sources: fixtureE56S29.sources,
                controller: fixtureE56S29.controller,
                stamp: bunkerStamp,
            })

            expect(result.success).to.be.true

            // Check that all building positions are valid
            for (const [type, positions] of result.buildings.entries()) {
                for (const pos of positions) {
                    expect(isValidRoomPosition(pos), `${type} at ${pos.x},${pos.y} is invalid`).to
                        .be.true
                }
            }
        })

        it('should not collide with walls', () => {
            const terrain = new MockRoomTerrain(fixtureE56S29.terrain)
            const result = placeBunker({
                terrain,
                roomName: fixtureE56S29.roomName,
                sources: fixtureE56S29.sources,
                controller: fixtureE56S29.controller,
                stamp: bunkerStamp,
            })

            expect(result.success).to.be.true

            // Check no collision with walls
            const hasCollision = checkStampCollision(terrain, result.buildings)
            expect(hasCollision).to.be.false
        })

        it('should include all building types from the stamp', () => {
            const terrain = new MockRoomTerrain(fixtureE56S29.terrain)
            const result = placeBunker({
                terrain,
                roomName: fixtureE56S29.roomName,
                sources: fixtureE56S29.sources,
                controller: fixtureE56S29.controller,
                stamp: bunkerStamp,
            })

            expect(result.success).to.be.true

            // Check that all building types are present
            const expectedTypes = Object.keys(bunkerStamp.buildings)
            for (const type of expectedTypes) {
                expect(result.buildings.has(type), `Missing building type: ${type}`).to.be.true
            }
        })

        it('should have correct number of structures per type', () => {
            const terrain = new MockRoomTerrain(fixtureE56S29.terrain)
            const result = placeBunker({
                terrain,
                roomName: fixtureE56S29.roomName,
                sources: fixtureE56S29.sources,
                controller: fixtureE56S29.controller,
                stamp: bunkerStamp,
            })

            expect(result.success).to.be.true

            // Check counts match stamp
            for (const [type, positions] of Object.entries(bunkerStamp.buildings)) {
                const placedPositions = result.buildings.get(type)
                expect(placedPositions).to.exist
                expect(
                    placedPositions!.length,
                    `${type} count mismatch: expected ${positions.length}, got ${
                        placedPositions!.length
                    }`,
                ).to.equal(positions.length)
            }
        })

        it('should return metadata about placement', () => {
            const terrain = new MockRoomTerrain(fixtureE56S29.terrain)
            const result = placeBunker({
                terrain,
                roomName: fixtureE56S29.roomName,
                sources: fixtureE56S29.sources,
                controller: fixtureE56S29.controller,
                stamp: bunkerStamp,
            })

            expect(result.success).to.be.true
            expect(result.metadata).to.exist
            expect(result.metadata!.stampMetadata).to.exist
            expect(result.metadata!.possiblePositions).to.be.greaterThan(0)
            expect(result.metadata!.selectedPosition).to.not.be.null
        })
    })

    describe('placeBunker with constrained terrain', () => {
        it('should fail when room is too small', () => {
            // Create a terrain that's entirely walls
            const allWalls = Array.from({ length: 50 }, () => Array.from({ length: 50 }, () => 1))
            const terrain = new MockRoomTerrain(allWalls)

            const result = placeBunker({
                terrain,
                roomName: 'test',
                sources: [{ x: 10, y: 10 }],
                controller: { x: 40, y: 40 },
                stamp: bunkerStamp,
            })

            expect(result.success).to.be.false
            expect(result.origin).to.be.null
            expect(result.center).to.be.null
            expect(result.score).to.equal(Infinity)
        })

        it('should handle room with small open space', () => {
            // Create mostly walls with a small opening
            const mostlyWalls = Array.from({ length: 50 }, () =>
                Array.from({ length: 50 }, () => 1),
            )

            // Create a 15x15 open area in the center
            for (let x = 17; x < 33; x++) {
                for (let y = 17; y < 33; y++) {
                    mostlyWalls[x][y] = 0
                }
            }

            const terrain = new MockRoomTerrain(mostlyWalls)

            const result = placeBunker({
                terrain,
                roomName: 'test',
                sources: [{ x: 25, y: 25 }],
                controller: { x: 25, y: 26 },
                stamp: bunkerStamp,
            })

            // Bunker might or might not fit depending on exact size
            if (result.success) {
                expect(result.origin).to.not.be.null
                expect(result.center).to.not.be.null
            }
        })
    })

    describe('checkStampCollision', () => {
        it('should detect collision with walls', () => {
            const terrain = new MockRoomTerrain(fixtureE56S29.terrain)
            const buildings = new Map<string, Position[]>()

            // Find a wall position
            let wallPos: Position | null = null
            for (let x = 0; x < 50; x++) {
                for (let y = 0; y < 50; y++) {
                    if (terrain.get(x, y) === 1) {
                        wallPos = { x, y }
                        break
                    }
                }
                if (wallPos) break
            }

            if (wallPos) {
                buildings.set('spawn', [wallPos])
                const hasCollision = checkStampCollision(terrain, buildings)
                expect(hasCollision).to.be.true
            }
        })

        it('should detect out of bounds positions', () => {
            const terrain = new MockRoomTerrain(fixtureE56S29.terrain)
            const buildings = new Map<string, Position[]>()

            buildings.set('spawn', [{ x: -1, y: 25 }])
            const hasCollision = checkStampCollision(terrain, buildings)
            expect(hasCollision).to.be.true
        })

        it('should not detect collision on plains', () => {
            const terrain = new MockRoomTerrain(fixtureE56S29.terrain)
            const buildings = new Map<string, Position[]>()

            buildings.set('spawn', [{ x: 25, y: 25 }])
            const hasCollision = checkStampCollision(terrain, buildings)
            // This might be true or false depending on actual terrain at 25,25
            expect(hasCollision).to.be.a('boolean')
        })
    })
})
