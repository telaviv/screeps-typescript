#!/usr/bin/env node

/**
 * CLI tool to download room terrain and visualize optimal bunker placement
 * Usage: yarn layout:bunker <room-name> [options]
 */

// Define Screeps constants that we need for standalone execution
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
import { visualizeBunkerPlacement } from '../src/stamps/visualizer'

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
        const value = this.terrain[x][y]
        if (value === 0 || value === 1 || value === 2) {
            return value as 0 | 1 | 2
        }
        return 0
    }
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
        const terrainResponse: any = await api.raw.game.roomTerrain(roomName, shard)

        // Parse terrain into 50x50 grid
        const terrain = Array.from({ length: 50 }, () => Array.from({ length: 50 }, () => 0))

        // Terrain data comes as a single string of 2500 characters (50x50)
        // Each character is: '0' = plain, '1' = wall, '2' = swamp
        if (terrainResponse.terrain && terrainResponse.terrain[0]) {
            const terrainString = terrainResponse.terrain[0].terrain
            for (let i = 0; i < terrainString.length; i++) {
                const x = i % 50
                const y = Math.floor(i / 50)
                terrain[x][y] = parseInt(terrainString[i])
            }
        }

        // Download room objects
        console.log(chalk.gray(`📥 Downloading room objects for ${roomName}...`))
        const roomDetailsResponse = await api.raw.game.roomObjects(roomName, shard)

        const sources: Array<{ x: number; y: number }> = []
        const minerals: Array<{ x: number; y: number; mineralType: string }> = []
        let controller: { x: number; y: number } | null = null

        if (roomDetailsResponse.objects) {
            for (const obj of roomDetailsResponse.objects) {
                const anyObj = obj as any
                if (anyObj.type === 'source') {
                    sources.push({ x: anyObj.x, y: anyObj.y })
                } else if (anyObj.type === 'controller') {
                    controller = { x: anyObj.x, y: anyObj.y }
                } else if (anyObj.type === 'mineral') {
                    minerals.push({ 
                        x: anyObj.x, 
                        y: anyObj.y,
                        mineralType: anyObj.mineralType || '?'
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

        // Visualize
        const visualization = visualizeBunkerPlacement(
            mockTerrain,
            result,
            roomName,
            sources,
            controller,
            minerals,
        )
        console.log(visualization)

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
    } catch (error: any) {
        console.error(chalk.red(`\n✗ Error: ${error.message}`))
        if (error.stack) {
            console.error(chalk.gray(error.stack))
        }
        process.exit(1)
    }
}

main()
