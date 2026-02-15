#!/usr/bin/env node

/**
 * CLI tool to visualize room fixtures from JSON files
 * Usage: yarn print:fixture <room-name>
 */

import * as fs from 'fs'
import * as path from 'path'
import { Command } from 'commander'
import chalk from 'chalk'

interface RoomFixture {
    roomName: string
    terrain: number[][]
    sources: { x: number; y: number }[]
    controller: { x: number; y: number } | null
    minerals: { x: number; y: number; mineralType: string }[]
}

// Mock RoomTerrain for visualization
class MockRoomTerrain implements RoomTerrain {
    private terrain: number[][]

    constructor(terrain: number[][]) {
        this.terrain = terrain
    }

    get(x: number, y: number): 0 | 1 | 2 {
        if (x < 0 || x >= 50 || y < 0 || y >= 50) {
            return 1 // Wall for out of bounds
        }
        const value = this.terrain[y][x]
        // Terrain is bitwise encoded: 0=plain, 1=wall, 2=swamp, 3=wall+swamp
        // For pathfinding purposes, wall takes precedence (can't walk on walls)
        if (value & 1) {
            return 1 // Wall (includes wall+swamp)
        }
        if (value & 2) {
            return 2 // Swamp
        }
        return 0 // Plain
    }
}

/**
 * Render a cell with terrain and natural objects (2 characters wide)
 */
function renderCell(
    terrainType: number,
    isSource: boolean,
    mineralType: string | undefined,
    isController: boolean,
): string {
    // Natural objects (source, mineral, controller) get white background
    if (isSource || mineralType || isController) {
        let symbol: string
        let color: (s: string) => string

        if (isSource) {
            symbol = '◉'
            color = chalk.yellow.bold
        } else if (mineralType) {
            symbol = mineralType
            color = chalk.cyan.bold
        } else {
            // isController
            symbol = '⚙'
            color = chalk.magenta.bold
        }

        return chalk.bgWhite(color(symbol) + ' ')
    }

    // Use terrain background
    let bg: (s: string) => string
    switch (terrainType) {
        case 1: // Wall
            bg = chalk.bgRgb(50, 50, 50) // Dark gray
            break
        case 2: // Swamp
            bg = chalk.bgRgb(40, 60, 40) // Dark green
            break
        default:
            // Plain - use default terminal background
            bg = (s: string) => s
            break
    }

    return bg('  ')
}

/**
 * Visualize a room fixture
 */
function visualizeFixture(fixture: RoomFixture): string {
    const lines: string[] = []
    const terrain = new MockRoomTerrain(fixture.terrain)

    // Header
    lines.push(chalk.bold.cyan(`\n═══════════════════════════════════════════════════════`))
    lines.push(chalk.bold.cyan(`  Room Fixture: ${fixture.roomName}`))
    lines.push(chalk.bold.cyan(`═══════════════════════════════════════════════════════`))

    // Room info
    lines.push(chalk.bold('\n📍 Room Objects:'))
    lines.push(`  ${chalk.yellow.bold('◉')} Sources: ${chalk.white(fixture.sources.length.toString())}`)
    for (let i = 0; i < fixture.sources.length; i++) {
        const src = fixture.sources[i]
        
        // Count walkable neighbors
        let walkable = 0
        let blocked = 0
        const neighbors = [
            { dx: 0, dy: -1 }, { dx: 1, dy: -1 }, { dx: 1, dy: 0 }, { dx: 1, dy: 1 },
            { dx: 0, dy: 1 }, { dx: -1, dy: 1 }, { dx: -1, dy: 0 }, { dx: -1, dy: -1 },
        ]
        
        for (const { dx, dy } of neighbors) {
            const nx = src.x + dx
            const ny = src.y + dy
            if (nx < 0 || nx >= 50 || ny < 0 || ny >= 50) {
                blocked++
                continue
            }
            const terrainType = terrain.get(nx, ny)
            if (terrainType === 1) {
                blocked++
            } else {
                walkable++
            }
        }
        
        lines.push(
            `    Source ${i + 1}: (${src.x}, ${src.y}) - ${walkable} walkable, ${blocked} blocked neighbors`,
        )
    }

    if (fixture.controller) {
        lines.push(
            `  ${chalk.magenta.bold('⚙')} Controller: ${chalk.white(`(${fixture.controller.x}, ${fixture.controller.y})`)}`,
        )
    }

    lines.push(`  ${chalk.cyan.bold('M')} Minerals: ${chalk.white(fixture.minerals.length.toString())}`)
    for (const mineral of fixture.minerals) {
        lines.push(
            `    ${chalk.cyan(mineral.mineralType)}: (${mineral.x}, ${mineral.y})`,
        )
    }

    // Terrain analysis
    lines.push(chalk.bold('\n🌍 Terrain Analysis:'))
    let wallCount = 0
    let swampCount = 0
    let plainCount = 0
    for (let x = 0; x < 50; x++) {
        for (let y = 0; y < 50; y++) {
            const terrainType = terrain.get(x, y)
            if (terrainType === 1) wallCount++
            else if (terrainType === 2) swampCount++
            else plainCount++
        }
    }
    lines.push(
        `  ${chalk.bgRgb(50, 50, 50)('  ')} Walls: ${chalk.yellow(wallCount.toString())} tiles (${((wallCount / 2500) * 100).toFixed(1)}%)`,
    )
    lines.push(
        `  ${chalk.bgRgb(40, 60, 40)('  ')} Swamps: ${chalk.yellow(swampCount.toString())} tiles (${((swampCount / 2500) * 100).toFixed(1)}%)`,
    )
    lines.push(
        `  Plains: ${chalk.yellow(plainCount.toString())} tiles (${((plainCount / 2500) * 100).toFixed(1)}%)`,
    )

    // Build lookup sets for natural objects
    const sourcePositions = new Set(fixture.sources.map((s) => `${s.x},${s.y}`))
    const mineralMap = new Map(fixture.minerals.map((m) => [`${m.x},${m.y}`, m.mineralType]))
    const controllerKey = fixture.controller ? `${fixture.controller.x},${fixture.controller.y}` : null

    // Render room grid
    lines.push(chalk.bold('\n🗺️  Room Layout:'))

    // Column header (00-49)
    let header = '     '
    for (let x = 0; x < 50; x++) {
        if (x % 5 === 0) {
            header += chalk.dim(x.toString().padStart(2, '0'))
        } else {
            header += '  '
        }
    }
    lines.push(header)

    // Top border
    let topBorder = '   ╔'
    for (let x = 0; x < 50; x++) {
        topBorder += '══'
    }
    topBorder += '╗'
    lines.push(chalk.dim(topBorder))

    for (let y = 0; y < 50; y++) {
        let line = chalk.dim(y.toString().padStart(2, '0') + ' ║')

        for (let x = 0; x < 50; x++) {
            const key = `${x},${y}`
            const terrainType = terrain.get(x, y)
            const isSource = sourcePositions.has(key)
            const mineralType = mineralMap.get(key)
            const isController = key === controllerKey

            line += renderCell(terrainType, isSource, mineralType, isController)
        }

        line += chalk.dim('║ ') + chalk.dim(y.toString().padStart(2, '0'))
        lines.push(line)
    }

    // Bottom border
    let bottomBorder = '   ╚'
    for (let x = 0; x < 50; x++) {
        bottomBorder += '══'
    }
    bottomBorder += '╝'
    lines.push(chalk.dim(bottomBorder))

    // Bottom column numbers
    lines.push(header)

    // Legend
    lines.push(chalk.bold('\n🔑 Legend:'))
    lines.push(
        `  Terrain: ${chalk.bgRgb(50, 50, 50)('  ')} Wall   ${chalk.bgRgb(40, 60, 40)('  ')} Swamp   ${chalk.dim('··')} Plain`,
    )
    lines.push(
        `  Natural: ${chalk.bgWhite(chalk.yellow.bold('◉'))} Source   ${chalk.bgWhite(
            chalk.cyan.bold('H/O/U/etc'),
        )} Mineral   ${chalk.bgWhite(chalk.magenta.bold('⚙'))} Controller`,
    )

    lines.push(chalk.bold.cyan(`\n═══════════════════════════════════════════════════════\n`))

    return lines.join('\n')
}

async function main() {
    const program = new Command()

    program
        .name('print:fixture')
        .description('Visualize room fixtures from JSON files')
        .argument('<room-name>', 'Room name (e.g., W8N2)')
        .option('--dir <path>', 'Fixtures directory', 'test/fixtures/terrain')
        .parse(process.argv)

    const roomName = program.args[0]
    const options = program.opts()
    const fixturesDir = path.join(__dirname, '..', options.dir)

    console.log(chalk.cyan(`\n🔧 Fixture Viewer`))
    console.log(chalk.gray(`   Room: ${roomName}`))
    console.log(chalk.gray(`   Directory: ${options.dir}\n`))

    // Load fixture
    const fixturePath = path.join(fixturesDir, `${roomName}.json`)
    if (!fs.existsSync(fixturePath)) {
        console.error(chalk.red(`✗ Fixture not found: ${roomName}.json`))
        console.error(chalk.gray(`  Path: ${fixturePath}`))
        console.error(
            chalk.gray(`  Run: yarn download:fixtures ${roomName} --neighbors`),
        )
        process.exit(1)
    }

    const fixtureData = fs.readFileSync(fixturePath, 'utf8')
    const fixture: RoomFixture = JSON.parse(fixtureData)

    // Visualize
    console.log(visualizeFixture(fixture))

    process.exit(0)
}

void main()
