import {
    BodyPartConstant,
    BOTTOM,
    BOTTOM_LEFT,
    BOTTOM_RIGHT,
    HEAL,
    LEFT,
    MOVE,
    RANGED_ATTACK,
    RIGHT,
    TERRAIN_WALL,
    TOP,
    TOP_LEFT,
    TOP_RIGHT,
} from 'game/constants'
import { Creep, Flag, Structure, StructureSpawn } from 'game/prototypes'
import { CostMatrix, searchPath } from 'game/path-finder'
import { getObjectsByPrototype, getTerrainAt } from 'game/utils'

// ============================================================================
// Type Declarations
// ============================================================================

interface Quad {
    id: number
    creeps: Creep[]
    topLeft: Creep | null
    topRight: Creep | null
    bottomLeft: Creep | null
    bottomRight: Creep | null
    isPacked: boolean
    targetPos: { x: number; y: number } | null
    packingArea: { x: number; y: number } | null // Cache the packing location
}

// ============================================================================
// Module State
// ============================================================================

const mySpawn = getObjectsByPrototype(StructureSpawn).find((spawn) => spawn.my)
const enemySpawn = getObjectsByPrototype(StructureSpawn).find((spawn) => !spawn.my)
const enemyFlag = getObjectsByPrototype(Flag).find((flag) => !flag.my)

const quads: Quad[] = []
let quadIdCounter = 0
const unassignedCreeps: Creep[] = []
let time = 0

// Cache the cost matrix since structures don't move
let cachedCostMatrix: CostMatrix | null = null

// ============================================================================
// Main Loop
// ============================================================================

export function loop(): void {
    time++
    if (!mySpawn || !enemyFlag) {
        return
    }

    // Spawn creeps for the quad (2 healers, 2 ranged attackers)
    if (quads.length === 0 && unassignedCreeps.length < 4) {
        const spawnOrder: BodyPartConstant[][] = [
            [RANGED_ATTACK, RANGED_ATTACK, MOVE, MOVE], // Ranged 1
            [RANGED_ATTACK, RANGED_ATTACK, MOVE, MOVE], // Ranged 2
            [HEAL, HEAL, MOVE, MOVE], // Healer 1
            [HEAL, HEAL, MOVE, MOVE], // Healer 2
        ]

        const index = unassignedCreeps.length
        if (index < spawnOrder.length) {
            const result = mySpawn.spawnCreep(spawnOrder[index])
            if (result.object) {
                unassignedCreeps.push(result.object)
                console.log(`Spawned creep ${index + 1}/4 for quad`)
            }
        }
    }

    // Form quad when we have 4 creeps that are fully spawned
    if (unassignedCreeps.length === 4 && quads.length === 0) {
        // Check if all creeps have finished spawning (have valid hits)
        const allSpawned = unassignedCreeps.every((c) => typeof c.hits === 'number' && c.hits > 0)

        if (allSpawned) {
            console.log(
                'Forming quad with creeps:',
                unassignedCreeps.map((c) => `hits:${c.hits}`),
            )
            const newQuad: Quad = {
                id: quadIdCounter++,
                creeps: [...unassignedCreeps],
                topLeft: null,
                topRight: null,
                bottomLeft: null,
                bottomRight: null,
                isPacked: false,
                targetPos: null,
                packingArea: null, // Will be set on first use
            }
            quads.push(newQuad)
            unassignedCreeps.length = 0
            console.log('Formed quad!')
        } else {
            console.log('Waiting for all creeps to finish spawning...')
        }
    }

    // Manage quads
    for (const quad of quads) {
        // Filter out dead creeps (but keep spawning ones)
        quad.creeps = quad.creeps.filter((c) => {
            // Check if creep still exists and has hits
            if (!c || typeof c.hits === 'undefined' || c.hits <= 0) {
                return false
            }
            return true
        })

        if (quad.creeps.length < 4) {
            console.log(`Quad lost creeps (has ${quad.creeps.length}/4), needs reformation`)
            continue
        }

        // Check if packed (only update if currently unpacked or if we've really broken formation)
        const currentlyPacked = isQuadPacked(quad.creeps)

        if (!quad.isPacked && currentlyPacked) {
            // Just became packed
            quad.isPacked = true
            assignQuadPositions(quad)
            console.log('Quad is packed and ready!')
        } else if (quad.isPacked) {
            // Already packed - update positions but stay in packed mode
            // unless we've REALLY broken apart (distance > 2)
            const maxDistance = Math.max(
                ...quad.creeps.flatMap((c1, i) =>
                    quad.creeps
                        .slice(i + 1)
                        .map((c2) => Math.max(Math.abs(c1.x - c2.x), Math.abs(c1.y - c2.y))),
                ),
            )

            if (maxDistance > 2) {
                // Actually broken apart - need to repack
                console.log('Quad broke formation, repacking...')
                quad.isPacked = false
                quad.packingArea = null // Find new packing area
            } else {
                // Still together enough - update positions
                assignQuadPositions(quad)
            }
        }

        // Combat actions
        quadCombat(quad)

        // Movement - move toward enemy flag to activate it
        if (enemyFlag) {
            moveQuad(quad, { x: enemyFlag.x, y: enemyFlag.y })
        }
    }
}

// ============================================================================
// Higher Order Functions (called by loop, in call order)
// ============================================================================

// Check if 4 creeps are in a packed 2x2 formation
function isQuadPacked(creeps: Creep[]): boolean {
    if (creeps.length !== 4) return false

    // All creeps must be adjacent to all others
    for (let i = 0; i < 4; i++) {
        for (let j = i + 1; j < 4; j++) {
            const distance = Math.max(
                Math.abs(creeps[i].x - creeps[j].x),
                Math.abs(creeps[i].y - creeps[j].y),
            )
            if (distance > 1) {
                return false
            }
        }
    }
    return true
}

// Assign creeps to their positions in the quad based on actual formation
function assignQuadPositions(quad: Quad): void {
    if (quad.creeps.length !== 4) return

    // Find the top-left creep (min x, then min y)
    const sorted = [...quad.creeps].sort((a, b) => {
        if (a.x !== b.x) return a.x - b.x
        return a.y - b.y
    })

    const minX = Math.min(...quad.creeps.map((c) => c.x))
    const minY = Math.min(...quad.creeps.map((c) => c.y))

    // Assign positions
    quad.topLeft = quad.creeps.find((c) => c.x === minX && c.y === minY) || null
    quad.topRight = quad.creeps.find((c) => c.x === minX + 1 && c.y === minY) || null
    quad.bottomLeft = quad.creeps.find((c) => c.x === minX && c.y === minY + 1) || null
    quad.bottomRight = quad.creeps.find((c) => c.x === minX + 1 && c.y === minY + 1) || null
}

// Perform combat actions for the quad
function quadCombat(quad: Quad): void {
    for (const creep of quad.creeps) {
        // Healers heal the quad
        if (creep.body.some((part) => part.type === HEAL)) {
            // Find most damaged creep in quad
            const damaged = quad.creeps.reduce((prev, curr) => {
                const prevRatio = prev.hits / prev.hitsMax
                const currRatio = curr.hits / curr.hitsMax
                return currRatio < prevRatio ? curr : prev
            })

            if (damaged.hits < damaged.hitsMax) {
                creep.heal(damaged)
            }
        }

        // Ranged attackers attack enemy spawn if in range
        if (creep.body.some((part) => part.type === RANGED_ATTACK)) {
            if (enemySpawn) {
                creep.rangedAttack(enemySpawn)
            }
        }
    }
}

// Move the quad in formation
function moveQuad(quad: Quad, target: { x: number; y: number }): void {
    if (!quad.isPacked || !quad.topLeft) {
        // Move to packing area first
        // Use cached packing area if available, otherwise find a new one
        if (!quad.packingArea) {
            quad.packingArea = findPackingArea()
            if (quad.packingArea) {
                console.log(`Found packing area at (${quad.packingArea.x}, ${quad.packingArea.y})`)
            }
        }

        const packArea = quad.packingArea
        if (!packArea) return

        // When not packed, just use moveTo() to get to positions
        // Formation doesn't matter until they're packed
        const positions = [
            { x: packArea.x, y: packArea.y }, // top-left
            { x: packArea.x + 1, y: packArea.y }, // top-right
            { x: packArea.x, y: packArea.y + 1 }, // bottom-left
            { x: packArea.x + 1, y: packArea.y + 1 }, // bottom-right
        ]

        quad.creeps.forEach((creep, i) => {
            if (positions[i]) {
                creep.moveTo(positions[i])
            }
        })
        return
    }

    // Quad is packed - use transformed pathfinding
    if (!cachedCostMatrix) {
        console.log('Calculating cost matrix for quad movement...')
        cachedCostMatrix = transformCostMatrixForQuad()
        console.log('Cost matrix calculated!')
    }

    const result = searchPath(
        quad.topLeft,
        { pos: target, range: 0 }, // Range 0 to walk directly on target (e.g., flag)
        {
            costMatrix: cachedCostMatrix,
        },
    )

    if (result.path && result.path.length > 0) {
        const nextPos = result.path[0]

        // Calculate direction
        const dx = nextPos.x - quad.topLeft.x
        const dy = nextPos.y - quad.topLeft.y

        // Convert dx/dy to direction constant
        const direction = getDirection(dx, dy)
        if (direction === null) return

        // Move all 4 creeps in the same direction using move() to maintain formation
        quad.creeps.forEach((creep) => {
            creep.move(direction)
        })
    }
}

// Helper function to convert dx/dy offsets to direction constants
function getDirection(dx: number, dy: number): number | null {
    if (dx === 0 && dy === -1) return TOP
    if (dx === 1 && dy === -1) return TOP_RIGHT
    if (dx === 1 && dy === 0) return RIGHT
    if (dx === 1 && dy === 1) return BOTTOM_RIGHT
    if (dx === 0 && dy === 1) return BOTTOM
    if (dx === -1 && dy === 1) return BOTTOM_LEFT
    if (dx === -1 && dy === 0) return LEFT
    if (dx === -1 && dy === -1) return TOP_LEFT
    return null // No movement
}

// ============================================================================
// Utility Functions (non-dependent helpers)
// ============================================================================

// Find a 2x2 area near the spawn to pack the quad
function findPackingArea(): { x: number; y: number } | null {
    if (!mySpawn) return null

    // Get all structures to avoid them
    const structures = getObjectsByPrototype(Structure)

    // Search around the spawn for a 2x2 free area
    for (let radius = 3; radius < 10; radius++) {
        for (let dx = -radius; dx <= radius; dx++) {
            for (let dy = -radius; dy <= radius; dy++) {
                const x = mySpawn.x + dx
                const y = mySpawn.y + dy

                // Check if 2x2 area starting at (x,y) is clear
                let isClear = true
                for (let ox = 0; ox < 2 && isClear; ox++) {
                    for (let oy = 0; oy < 2 && isClear; oy++) {
                        const checkX = x + ox
                        const checkY = y + oy

                        // Check terrain
                        const terrain = getTerrainAt({ x: checkX, y: checkY })
                        if (terrain === TERRAIN_WALL) {
                            isClear = false
                            break
                        }

                        // Check if any structure is on this tile
                        const hasStructure = structures.some(
                            (s) => s.x === checkX && s.y === checkY,
                        )
                        if (hasStructure) {
                            isClear = false
                            break
                        }
                    }
                }

                if (isClear) {
                    return { x, y }
                }
            }
        }
    }
    return null
}

// Transform cost matrix for quad movement (2x2 footprint)
function transformCostMatrixForQuad(): CostMatrix {
    const result = new CostMatrix()

    // Get all structures and create a Set of impassable positions
    // Only enemy structures and non-rampart structures are impassable
    const structures = getObjectsByPrototype(Structure)
    const impassablePositions = new Set<string>()
    for (const structure of structures) {
        // Allow passage through friendly ramparts, but block enemy structures and spawns
        const isRampart = structure.hits && structure.hitsMax && structure.hitsMax >= 10000 // Ramparts have high HP
        const isPassable = isRampart && structure.my

        if (!isPassable) {
            impassablePositions.add(`${structure.x},${structure.y}`)
        }
    }

    for (let x = 0; x < 100; x++) {
        for (let y = 0; y < 100; y++) {
            let maxCost = 1 // Default plain cost

            // Check all 4 tiles the quad would occupy if top-left is at (x,y)
            const offsets = [
                { x: 0, y: 0 },
                { x: 1, y: 0 },
                { x: 0, y: 1 },
                { x: 1, y: 1 },
            ]

            for (const offset of offsets) {
                const nx = x + offset.x
                const ny = y + offset.y

                // Out of bounds = impassable
                if (nx >= 100 || ny >= 100) {
                    maxCost = 255
                    break
                }

                const terrain = getTerrainAt({ x: nx, y: ny })
                if (terrain === TERRAIN_WALL) {
                    maxCost = 255
                    break
                }

                // Check if any impassable structure is on this tile (O(1) lookup)
                if (impassablePositions.has(`${nx},${ny}`)) {
                    maxCost = 255
                    break
                }

                // For swamp, use higher cost (not sure if arena has swamps, but handle it)
                maxCost = Math.max(maxCost, 1)
            }

            result.set(x, y, maxCost)
        }
    }

    return result
}
