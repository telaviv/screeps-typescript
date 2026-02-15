#!/usr/bin/env node

/**
 * CLI tool to download room terrain and objects from Screeps and save as test fixtures
 * Usage: yarn download:fixtures <room-name> [options]
 */

import * as fs from 'fs'
import * as path from 'path'
import { Command } from 'commander'
import { ScreepsAPI } from 'screeps-api'
import chalk from 'chalk'

interface RoomFixture {
    roomName: string
    terrain: number[][]
    sources: { x: number; y: number }[]
    controller: { x: number; y: number } | null
    minerals: { x: number; y: number; mineralType: string }[]
}

/**
 * Get neighboring room names (4 cardinal directions)
 */
function getNeighboringRooms(roomName: string): string[] {
    const match = roomName.match(/^([WE])(\d+)([NS])(\d+)$/)
    if (!match) return []

    const [, ewDir, ewNum, nsDir, nsNum] = match
    const x = ewDir === 'E' ? parseInt(ewNum, 10) : -parseInt(ewNum, 10) - 1
    const y = nsDir === 'S' ? parseInt(nsNum, 10) : -parseInt(nsNum, 10) - 1

    const neighbors: string[] = []

    // East
    const eastX = x + 1
    neighbors.push(
        `${eastX >= 0 ? 'E' : 'W'}${Math.abs(eastX >= 0 ? eastX : eastX + 1)}${
            y >= 0 ? 'S' : 'N'
        }${Math.abs(y >= 0 ? y : y + 1)}`,
    )

    // West
    const westX = x - 1
    neighbors.push(
        `${westX >= 0 ? 'E' : 'W'}${Math.abs(westX >= 0 ? westX : westX + 1)}${
            y >= 0 ? 'S' : 'N'
        }${Math.abs(y >= 0 ? y : y + 1)}`,
    )

    // South
    const southY = y + 1
    neighbors.push(
        `${x >= 0 ? 'E' : 'W'}${Math.abs(x >= 0 ? x : x + 1)}${southY >= 0 ? 'S' : 'N'}${Math.abs(
            southY >= 0 ? southY : southY + 1,
        )}`,
    )

    // North
    const northY = y - 1
    neighbors.push(
        `${x >= 0 ? 'E' : 'W'}${Math.abs(x >= 0 ? x : x + 1)}${northY >= 0 ? 'S' : 'N'}${Math.abs(
            northY >= 0 ? northY : northY + 1,
        )}`,
    )

    return neighbors
}

/**
 * Download terrain and objects for a room
 */
async function downloadRoomFixture(
    api: any,
    roomName: string,
    shard: string,
): Promise<RoomFixture | null> {
    try {
        // Download terrain
        const terrainResponse: any = await api.raw.game.roomTerrain(roomName, shard)

        // Check for API error response
        if (terrainResponse.error) {
            console.error(chalk.red(`  ✗ API error: ${terrainResponse.error}`))
            return null
        }

        const terrain = Array.from({ length: 50 }, () => Array.from({ length: 50 }, () => 0))

        if (terrainResponse.terrain && terrainResponse.terrain[0]) {
            const terrainString = terrainResponse.terrain[0].terrain
            for (let i = 0; i < terrainString.length; i++) {
                const x = i % 50
                const y = Math.floor(i / 50)
                terrain[y][x] = parseInt(terrainString[i], 10)
            }
        } else {
            console.error(chalk.red(`  ✗ No terrain data in response`))
            return null
        }

        // Download room objects
        const roomDetailsResponse = await api.raw.game.roomObjects(roomName, shard)

        // Check for API error response
        if (roomDetailsResponse.error) {
            console.error(chalk.red(`  ✗ API error: ${roomDetailsResponse.error}`))
            return null
        }

        const sources: { x: number; y: number }[] = []
        const minerals: { x: number; y: number; mineralType: string }[] = []
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
                        mineralType: anyObj.mineralType || '?',
                    })
                }
            }
        }

        return {
            roomName,
            terrain,
            sources,
            controller,
            minerals,
        }
    } catch (error) {
        console.error(chalk.red(`  ✗ Exception: ${(error as Error).message}`))
        return null
    }
}

/**
 * Save fixture to file
 */
function saveFixture(fixture: RoomFixture, outputDir: string): void {
    const filePath = path.join(outputDir, `${fixture.roomName}.json`)
    fs.writeFileSync(filePath, JSON.stringify(fixture, null, 4))
    console.log(chalk.green(`  ✓ Saved ${fixture.roomName}.json`))
}

async function main() {
    const program = new Command()

    program
        .name('download:fixtures')
        .description('Download room terrain and objects from Screeps and save as test fixtures')
        .argument('<room-name>', 'Room name (e.g., W1N8)')
        .option('--shard <number>', 'Shard number', '3')
        .option('--server <name>', 'Server config name from screeps.json', 'pserver')
        .option('--neighbors', 'Also download neighboring rooms', false)
        .parse(process.argv)

    const roomName = program.args[0]
    const options = program.opts()
    const shard = `shard${options.shard}`
    const serverName = options.server
    const includeNeighbors = options.neighbors

    console.log(chalk.cyan(`\n🔧 Fixture Download Tool`))
    console.log(chalk.gray(`   Room: ${roomName}`))
    console.log(chalk.gray(`   Shard: ${shard}`))
    console.log(chalk.gray(`   Server: ${serverName}`))
    console.log(chalk.gray(`   Include neighbors: ${includeNeighbors ? 'yes' : 'no'}\n`))

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

    // Setup output directory
    const outputDir = path.join(__dirname, '..', 'test', 'fixtures', 'terrain')
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true })
    }

    console.log(chalk.gray(`📥 Downloading fixtures...\n`))

    // Download main room
    console.log(chalk.gray(`Downloading ${roomName}...`))
    const mainFixture = await downloadRoomFixture(api, roomName, shard)
    if (!mainFixture) {
        console.error(chalk.red(`✗ Failed to download ${roomName}`))
        process.exit(1)
    }

    console.log(chalk.gray(`  Sources: ${mainFixture.sources.length}`))
    console.log(chalk.gray(`  Controller: ${mainFixture.controller ? 'yes' : 'no'}`))
    console.log(chalk.gray(`  Minerals: ${mainFixture.minerals.length}`))
    saveFixture(mainFixture, outputDir)

    // Download neighbors if requested
    if (includeNeighbors) {
        console.log(chalk.gray(`\n📍 Downloading neighboring rooms...\n`))
        const neighbors = getNeighboringRooms(roomName)

        for (const neighborName of neighbors) {
            console.log(chalk.gray(`Downloading ${neighborName}...`))
            const fixture = await downloadRoomFixture(api, neighborName, shard)

            if (fixture) {
                console.log(chalk.gray(`  Sources: ${fixture.sources.length}`))
                console.log(chalk.gray(`  Controller: ${fixture.controller ? 'yes' : 'no'}`))
                console.log(chalk.gray(`  Minerals: ${fixture.minerals.length}`))
                saveFixture(fixture, outputDir)
            }
        }
    }

    console.log(chalk.green.bold(`\n✓ Fixtures downloaded successfully!`))
    console.log(chalk.gray(`  Output: ${outputDir}`))
    process.exit(0)
}

void main()
