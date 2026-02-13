#!/usr/bin/env node

/**
 * CLI tool to download room terrain and visualize optimal bunker placement
 * Usage: yarn layout:bunker <room-name> [options]
 */

// Define Screeps constants that we need for standalone execution
// eslint-disable-next-line @typescript-eslint/no-explicit-any
;(global as any).TERRAIN_MASK_WALL = 1
;(global as any).TERRAIN_MASK_SWAMP = 2
;(global as any).STRUCTURE_EXTENSION = 'extension'
;(global as any).STRUCTURE_RAMPART = 'rampart'
;(global as any).STRUCTURE_ROAD = 'road'
;(global as any).STRUCTURE_SPAWN = 'spawn'
;(global as any).STRUCTURE_LINK = 'link'
;(global as any).STRUCTURE_WALL = 'constructedWall'
;(global as any).STRUCTURE_STORAGE = 'storage'
;(global as any).STRUCTURE_TOWER = 'tower'
;(global as any).STRUCTURE_OBSERVER = 'observer'
;(global as any).STRUCTURE_POWER_SPAWN = 'powerSpawn'
;(global as any).STRUCTURE_EXTRACTOR = 'extractor'
;(global as any).STRUCTURE_LAB = 'lab'
;(global as any).STRUCTURE_TERMINAL = 'terminal'
;(global as any).STRUCTURE_CONTAINER = 'container'
;(global as any).STRUCTURE_NUKER = 'nuker'
;(global as any).STRUCTURE_FACTORY = 'factory'

import * as fs from 'fs'
import * as path from 'path'
import { Command } from 'commander'
import { ScreepsAPI } from 'screeps-api'
import chalk from 'chalk'

import bunkerStamp from '../src/stamps/bunker'
import { placeBunker } from '../src/stamps/placement'
import { calculateBunkerRoads } from '../src/stamps/roads'
import { calculateStationaryPoints } from '../src/stamps/stationary-points'
import { calculateLinks } from '../src/stamps/links'
import { calculateRamparts } from '../src/stamps/ramparts'
import { visualizeBunkerPlacement } from '../src/stamps/visualizer'
import { calculateSingleMineRoads } from '../src/stamps/single-mine-roads'
import { parseRoomName, getRoomNameFromCoords } from '../src/libs/pathfinding'

// Mock RoomTerrain for standalone use
class MockRoomTerrain implements RoomTerrain {
    private terrain: number[][]

    constructor(terrain: number[][]) {
        this.terrain = terrain
    }

    get(x: number, y: number): 0 | 1 | 2 {
        if (x < 0 || x >= 50 || y < 0 || y >= 50) {
            return 1 // Wall for out of bounds
        }
        const value = this.terrain[y][x] // Row-major indexing: terrain[y][x]
        if (value === 0 || value === 1 || value === 2) {
            return value
        }
        return 0
    }
}

// Get neighboring room names (up to 4 cardinal directions)
function getNeighboringRooms(roomName: string): string[] {
    const coords = parseRoomName(roomName)
    return [
        getRoomNameFromCoords(coords.x + 1, coords.y), // East
        getRoomNameFromCoords(coords.x - 1, coords.y), // West
        getRoomNameFromCoords(coords.x, coords.y + 1), // North
        getRoomNameFromCoords(coords.x, coords.y - 1), // South
    ]
}

// Download terrain for a room
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function downloadTerrain(
    api: any,
    roomName: string,
    shard: string,
): Promise<number[][] | null> {
    try {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
        const terrainResponse: any = await api.raw.game.roomTerrain(roomName, shard)
        const terrain = Array.from({ length: 50 }, () => Array.from({ length: 50 }, () => 0))

        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        if (terrainResponse.terrain && terrainResponse.terrain[0]) {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
            const terrainString = terrainResponse.terrain[0].terrain
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
            for (let i = 0; i < terrainString.length; i++) {
                const x = i % 50
                const y = Math.floor(i / 50)
                // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access
                terrain[y][x] = parseInt(terrainString[i], 10) // Store as terrain[y][x] for row-major indexing
            }
        } else {
            return null
        }
        return terrain
    } catch (error) {
        return null
    }
}

/**
 * Builds pathfinding cost modifiers from bunker buildings
 * @param buildings - Map of structure types to positions
 * @param roomName - Name of the room
 * @returns Objects containing obstacles (blocked positions) and roads (preferred low-cost paths)
 */
function buildPathfindingCosts(
    buildings: Map<string, { x: number; y: number }[]>,
    roomName: string,
): { obstacles: Set<string>; roads: Set<string> } {
    const obstacles = new Set<string>()
    const roads = new Set<string>()

    // First pass: collect all roads
    const roadPositions = buildings.get('road') || []
    for (const pos of roadPositions) {
        roads.add(`${roomName}:${pos.x},${pos.y}`)
    }

    // Second pass: add obstacles, but skip positions that have roads
    for (const [structType, positions] of buildings.entries()) {
        if (structType !== 'road' && structType !== 'rampart') {
            // Other buildings (except ramparts) are obstacles (cost 255)
            // BUT: if there's a road at the same position, don't block it
            for (const pos of positions) {
                const posKey = `${roomName}:${pos.x},${pos.y}`
                if (!roads.has(posKey)) {
                    obstacles.add(posKey)
                }
            }
        }
    }

    return { obstacles, roads }
}

/**
 * Mine connection information for each neighboring room
 * Tracks exit/entrance positions and road counts for visualization
 */
interface MineConnection {
    /** Name of the mine room (e.g., "E53S29") */
    name: string
    /** Position where creeps exit the base room */
    exitPosition: { x: number; y: number }
    /** Position where creeps enter the mine room */
    entrancePosition: { x: number; y: number }
    /** Number of sources in the mine room */
    sourceCount: number
    /** Number of road tiles in the base room leading to this mine */
    baseRoadCount: number
    /** Number of road tiles in the mine room from entrance to sources */
    mineRoadCount: number
}

/**
 * Calculates mine connection (roads and exit/entrance positions) for a single mine room
 */
function calculateMineConnection(
    baseRoomName: string,
    storagePos: { x: number; y: number },
    mineRoom: { name: string; sources: { x: number; y: number }[] },
    obstacles: Set<string>,
    roads: Set<string>,
): (MineConnection & { baseRoads: { x: number; y: number }[] }) | null {
    // Remove the start position from obstacles (storage link stationary point shouldn't block itself)
    const obstaclesWithoutStart = new Set(obstacles)
    const storageKey = `${baseRoomName}:${storagePos.x},${storagePos.y}`
    obstaclesWithoutStart.delete(storageKey)

    const result = calculateSingleMineRoads({
        baseRoomName,
        startPosition: storagePos,
        mineRoomName: mineRoom.name,
        mineSources: mineRoom.sources,
        obstacles: obstaclesWithoutStart,
        roads,
    })

    if (!result) {
        return null
    }

    return {
        name: mineRoom.name,
        exitPosition: result.exitPosition,
        entrancePosition: result.entrancePosition,
        sourceCount: mineRoom.sources.length,
        baseRoadCount: result.baseRoads.length,
        mineRoadCount: result.mineRoads.length,
        baseRoads: result.baseRoads,
    }
}

/**
 * Logs mine connection information to console
 */
function logMineConnection(baseRoomName: string, connection: MineConnection): void {
    console.log(
        chalk.green(
            `  ✓ ${connection.name}: exit (${connection.exitPosition.x},${connection.exitPosition.y}) → entrance (${connection.entrancePosition.x},${connection.entrancePosition.y})`,
        ),
    )
    console.log(
        chalk.gray(
            `    Roads: ${connection.baseRoadCount} in base, ${connection.mineRoadCount} in mine`,
        ),
    )
}

/**
 * Displays summary table of all mine connections
 */
function displayMineSummary(
    baseRoomName: string,
    connections: MineConnection[],
    totalRoads: number,
): void {
    console.log(chalk.bold.cyan(`\n═══════════════════════════════════════════════════════`))
    console.log(chalk.bold.cyan(`  Mine Exit Positions & Roads`))
    console.log(chalk.bold.cyan(`═══════════════════════════════════════════════════════`))

    for (const mine of connections) {
        console.log(chalk.bold(`\n${mine.name} (${mine.sourceCount} source(s)):`))
        console.log(
            chalk.gray(
                `  Exit from ${baseRoomName}: (${mine.exitPosition.x}, ${mine.exitPosition.y})`,
            ),
        )
        console.log(
            chalk.gray(
                `  Entrance to ${mine.name}: (${mine.entrancePosition.x}, ${mine.entrancePosition.y})`,
            ),
        )
        console.log(
            chalk.gray(
                `  Roads: ${mine.baseRoadCount} tiles in base, ${mine.mineRoadCount} tiles in mine`,
            ),
        )
    }

    console.log(chalk.bold(`\n${chalk.green('Total:')} ${totalRoads} mine road tiles in base room`))
    console.log(chalk.bold.cyan(`\n═══════════════════════════════════════════════════════\n`))
}

async function main() {
    const program = new Command()

    program
        .name('layout:bunker')
        .description('Download room terrain and visualize optimal bunker placement')
        .argument('<room-name>', 'Room name (e.g., E56S29)')
        .option('--shard <number>', 'Shard number', '0')
        .option('--server <name>', 'Server config name from screeps.json', 'main')
        .option('--save', 'Save visualization to file')
        .parse(process.argv)

    const roomName = program.args[0]
    const options = program.opts()
    const shard = `shard${options.shard}`
    const serverName = options.server

    console.log(chalk.cyan(`\n🔧 Bunker Layout Tool`))
    console.log(chalk.gray(`   Room: ${roomName}`))
    console.log(chalk.gray(`   Shard: ${shard}`))
    console.log(chalk.gray(`   Server: ${serverName}\n`))

    // Load screeps.json config
    const configPath = path.join(__dirname, '..', 'screeps.json')
    if (!fs.existsSync(configPath)) {
        console.error(chalk.red('✗ screeps.json not found'))
        console.error(chalk.gray('  Please create screeps.json with your API credentials'))
        process.exit(1)
    }

    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'))
    const serverConfig = config[serverName]

    if (!serverConfig) {
        console.error(chalk.red(`✗ Server config "${serverName}" not found in screeps.json`))
        process.exit(1)
    }

    // Initialize API
    console.log(chalk.gray(`📡 Connecting to ${serverConfig.hostname}...`))
    const api = new ScreepsAPI({
        token: serverConfig.token,
        protocol: serverConfig.protocol,
        hostname: serverConfig.hostname,
        port: serverConfig.port,
        path: serverConfig.path || '/',
    })

    try {
        // Download terrain
        console.log(chalk.gray(`📥 Downloading terrain for ${roomName}...`))
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
        const terrainResponse: any = await api.raw.game.roomTerrain(roomName, shard)

        // Parse terrain into 50x50 grid
        const terrain = Array.from({ length: 50 }, () => Array.from({ length: 50 }, () => 0))

        // Terrain data comes as a single string of 2500 characters (50x50)
        // Each character is: '0' = plain, '1' = wall, '2' = swamp
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        if (terrainResponse.terrain && terrainResponse.terrain[0]) {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
            const terrainString = terrainResponse.terrain[0].terrain
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
            for (let i = 0; i < terrainString.length; i++) {
                const x = i % 50
                const y = Math.floor(i / 50)
                // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access
                terrain[y][x] = parseInt(terrainString[i], 10) // Store as terrain[y][x] for row-major indexing
            }
        }

        // Download room objects
        console.log(chalk.gray(`📥 Downloading room objects for ${roomName}...`))
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        const roomDetailsResponse = await api.raw.game.roomObjects(roomName, shard)

        const sources: { x: number; y: number }[] = []
        const minerals: { x: number; y: number; mineralType: string }[] = []
        let controller: { x: number; y: number } | null = null

        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        if (roomDetailsResponse.objects) {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
            for (const obj of roomDetailsResponse.objects) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment
                const anyObj = obj as any
                // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
                if (anyObj.type === 'source') {
                    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
                    sources.push({ x: anyObj.x, y: anyObj.y })
                    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
                } else if (anyObj.type === 'controller') {
                    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
                    controller = { x: anyObj.x, y: anyObj.y }
                    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
                } else if (anyObj.type === 'mineral') {
                    minerals.push({
                        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
                        x: anyObj.x,
                        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
                        y: anyObj.y,
                        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
                        mineralType: anyObj.mineralType || '?',
                    })
                }
            }
        }

        if (sources.length === 0) {
            console.error(chalk.red('✗ No sources found in room'))
            console.error(chalk.gray('  This might be a highway room or you may not have vision'))
            process.exit(1)
        }

        if (!controller) {
            console.error(chalk.red('✗ No controller found in room'))
            console.error(chalk.gray('  This might be a source keeper room or highway'))
            process.exit(1)
        }

        console.log(chalk.green(`✓ Room data downloaded successfully`))
        console.log(chalk.gray(`  Sources: ${sources.length}`))
        console.log(chalk.gray(`  Minerals: ${minerals.length}`))
        console.log(chalk.gray(`  Controller: (${controller.x}, ${controller.y})`))

        // Check neighboring rooms for potential mines
        console.log(chalk.gray(`\n📍 Checking neighboring rooms for mines...`))
        const neighboringRooms = getNeighboringRooms(roomName)
        const mineRooms: {
            name: string
            sources: { x: number; y: number }[]
            terrain: number[][]
        }[] = []

        for (const neighborName of neighboringRooms) {
            console.log(chalk.gray(`  Checking ${neighborName}...`))
            try {
                // Download terrain
                const neighborTerrain = await downloadTerrain(api, neighborName, shard)
                if (!neighborTerrain) {
                    console.log(chalk.gray(`    ✗ Could not download terrain`))
                    continue
                }

                // Download objects
                // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
                const neighborObjects = await api.raw.game.roomObjects(neighborName, shard)
                const neighborSources: { x: number; y: number }[] = []

                // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
                if (neighborObjects.objects) {
                    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-call
                    for (const obj of neighborObjects.objects) {
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment
                        const anyObj = obj as any
                        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
                        if (anyObj.type === 'source') {
                            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
                            neighborSources.push({ x: anyObj.x, y: anyObj.y })
                        }
                    }
                }

                if (neighborSources.length > 0) {
                    console.log(
                        chalk.green(`    ✓ Mine room with ${neighborSources.length} source(s)`),
                    )
                    mineRooms.push({
                        name: neighborName,
                        sources: neighborSources,
                        terrain: neighborTerrain,
                    })
                } else {
                    console.log(chalk.gray(`    ✗ No sources found`))
                }
            } catch (error: unknown) {
                const err = error as Error
                console.log(chalk.gray(`    ✗ Error: ${err.message}`))
            }
        }

        console.log(chalk.green(`✓ Found ${mineRooms.length} potential mine room(s) in neighbors`))

        // Calculate bunker placement
        console.log(chalk.gray(`\n🧮 Calculating optimal bunker placement...`))

        const mockTerrain = new MockRoomTerrain(terrain)
        const result = placeBunker({
            terrain: mockTerrain,
            roomName,
            sources,
            controller,
            stamp: bunkerStamp,
        })

        // Calculate stationary points, links, ramparts, and roads
        let stationaryPoints
        let links
        if (result.success && minerals.length > 0) {
            console.log(chalk.gray(`🧮 Calculating bunker features...`))

            // Stationary points
            const sourcesWithIds = sources.map((s, idx) => ({
                id:
                    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-explicit-any
                    Object.keys(
                        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
                        roomDetailsResponse.objects?.find(
                            (o: any) => o.type === 'source' && o.x === s.x && o.y === s.y,
                        ) || {},
                    )[0] || `source${idx}`,
                x: s.x,
                y: s.y,
            }))

            stationaryPoints = calculateStationaryPoints(
                mockTerrain,
                result.buildings,
                sourcesWithIds,
                controller,
                minerals[0],
            )
            console.log(chalk.gray(`  ✓ Stationary points calculated`))

            // Links
            links = calculateLinks(
                mockTerrain,
                result.buildings,
                stationaryPoints,
                sourcesWithIds,
                controller,
            )
            console.log(chalk.gray(`  ✓ Links calculated`))

            // Ramparts
            console.log(chalk.gray(`🛡️  Calculating rampart network...`))
            const ramparts = calculateRamparts(
                mockTerrain,
                result.buildings,
                stationaryPoints,
                sources,
                controller,
                minerals[0],
            )
            const existingRamparts = result.buildings.get('rampart') || []
            result.buildings.set('rampart', ramparts)
            console.log(chalk.gray(`  Bunker ramparts: ${existingRamparts.length} tiles`))
            console.log(chalk.gray(`  Total ramparts: ${ramparts.length} tiles`))

            // Roads
            console.log(chalk.gray(`🛣️  Calculating road network...`))
            const roads = calculateBunkerRoads(
                mockTerrain,
                result.buildings,
                sources,
                controller,
                minerals[0],
            )
            const existingRoads = result.buildings.get('road') || []
            const allRoads = [...existingRoads, ...roads]
            result.buildings.set('road', allRoads)
            console.log(chalk.gray(`  Bunker roads: ${existingRoads.length} tiles`))
            console.log(chalk.gray(`  External roads: ${roads.length} tiles`))
            console.log(chalk.gray(`  Total roads: ${allRoads.length} tiles`))
        }

        const mineConnections: MineConnection[] = []
        let totalMineRoadsInBase = 0

        if (mineRooms.length > 0 && stationaryPoints) {
            console.log(chalk.gray(`\n🚪 Calculating mine exit positions and roads...`))

            // Setup terrain cache for pathfinding
            // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
            ;(global as any).Game = {
                map: {
                    getRoomTerrain: (rName: string) => {
                        if (rName === roomName) {
                            return mockTerrain
                        }
                        const mineRoom = mineRooms.find((m) => m.name === rName)
                        if (mineRoom) {
                            return new MockRoomTerrain(mineRoom.terrain)
                        }
                        throw new Error(`Unknown room: ${rName}`)
                    },
                },
            }

            // Collect all mine roads to add to base room
            const allMineRoadsInBase: { x: number; y: number }[] = []

            // Use storage link stationary point as start - it's always accessible and walkable
            const startPos = stationaryPoints.storageLink

            // Build pathfinding cost modifiers
            const { obstacles, roads } = buildPathfindingCosts(result.buildings, roomName)

            const startKey = `${roomName}:${startPos.x},${startPos.y}`
            console.log(chalk.gray(`  Debug: Start: ${startPos.x},${startPos.y}`))
            console.log(chalk.gray(`  Debug: Obstacles: ${obstacles.size}, Roads: ${roads.size}`))
            console.log(chalk.gray(`  Debug: Start is obstacle: ${obstacles.has(startKey)}`))
            console.log(chalk.gray(`  Debug: Start is road: ${roads.has(startKey)}`))

            // Calculate roads for each mine room
            for (const mineRoom of mineRooms) {
                const connection = calculateMineConnection(
                    roomName,
                    startPos,
                    mineRoom,
                    obstacles,
                    roads,
                )

                if (connection) {
                    mineConnections.push(connection)
                    allMineRoadsInBase.push(...connection.baseRoads)
                    logMineConnection(roomName, connection)
                } else {
                    console.log(chalk.yellow(`  ✗ ${mineRoom.name}: Could not find path`))
                }
            }

            // Add mine roads to the base room's buildings
            if (allMineRoadsInBase.length > 0) {
                const existingRoads = result.buildings.get('road') || []
                const combinedRoads = [...existingRoads, ...allMineRoadsInBase]
                result.buildings.set('road', combinedRoads)
                totalMineRoadsInBase = allMineRoadsInBase.length
                console.log(
                    chalk.green(`\n✓ Added ${totalMineRoadsInBase} mine road tiles to base room`),
                )
                console.log(
                    chalk.gray(
                        `  Previous roads: ${existingRoads.length}, Total roads now: ${combinedRoads.length}`,
                    ),
                )
            }
        }

        // Visualize
        const visualization = visualizeBunkerPlacement(
            mockTerrain,
            result,
            roomName,
            sources,
            controller,
            minerals,
            {
                stationaryPoints,
                links,
            },
        )
        console.log(visualization)

        // Display mine exit information summary
        if (mineConnections.length > 0) {
            displayMineSummary(roomName, mineConnections, totalMineRoadsInBase)
        }

        // Save to file if requested
        if (options.save) {
            const outputDir = path.join(__dirname, '..', 'output')
            if (!fs.existsSync(outputDir)) {
                fs.mkdirSync(outputDir, { recursive: true })
            }
            const outputPath = path.join(outputDir, `${roomName}-bunker-layout.txt`)
            fs.writeFileSync(outputPath, visualization)
            console.log(chalk.green(`✓ Visualization saved to ${outputPath}`))
        }

        if (result.success) {
            console.log(chalk.green.bold('✓ Bunker placement complete!'))
            process.exit(0)
        } else {
            console.log(chalk.yellow.bold('⚠ Could not place bunker in this room'))
            process.exit(1)
        }
    } catch (error: unknown) {
        const err = error as Error
        console.error(chalk.red(`\n✗ Error: ${err.message}`))
        if (err.stack) {
            console.error(chalk.gray(err.stack))
        }
        process.exit(1)
    }
}

void main()
