import chalk from 'chalk'

import { BunkerPlacementResult } from './placement'
import { Position } from '../types'
import { StationaryPointsResult } from './stationary-points'
import { LinksResult } from './links'

export interface MineralPosition extends Position {
    mineralType: string
}

export interface VisualizationOptions {
    stationaryPoints?: StationaryPointsResult
    links?: LinksResult
}

/**
 * Visualizes a bunker placement result using ANSI colors in the terminal
 */
export function visualizeBunkerPlacement(
    terrain: RoomTerrain,
    result: BunkerPlacementResult,
    roomName: string,
    sources: Position[] = [],
    controller: Position | null = null,
    minerals: MineralPosition[] = [],
    options?: VisualizationOptions,
): string {
    const lines: string[] = []

    // Header
    lines.push(chalk.bold.cyan(`\n═══════════════════════════════════════════════════════`))
    lines.push(chalk.bold.cyan(`  Bunker Layout for ${roomName}`))
    lines.push(chalk.bold.cyan(`═══════════════════════════════════════════════════════`))

    if (!result.success) {
        lines.push(chalk.red('\n✗ Failed to place bunker - room too constrained'))
        return lines.join('\n')
    }

    // Placement info
    if (!result.origin || !result.center) {
        lines.push(chalk.red('\n✗ Unexpected error: missing origin or center'))
        return lines.join('\n')
    }

    lines.push(
        chalk.green(
            `\n✓ Bunker placed successfully at origin (${result.origin.x}, ${result.origin.y})`,
        ),
    )
    lines.push(chalk.gray(`  Center: (${result.center.x}, ${result.center.y})`))
    lines.push(chalk.gray(`  Score: ${result.score.toFixed(2)}`))

    // Build lookup maps for faster access
    const buildingMap = new Map<string, string[]>()
    for (const [type, positions] of result.buildings.entries()) {
        for (const pos of positions) {
            const key = `${pos.x},${pos.y}`
            if (!buildingMap.has(key)) {
                buildingMap.set(key, [])
            }
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            buildingMap.get(key)!.push(type)
        }
    }

    // Build lookup sets for natural objects
    const sourcePositions = new Set(sources.map((s) => `${s.x},${s.y}`))
    const mineralMap = new Map(minerals.map((m) => [`${m.x},${m.y}`, m.mineralType]))
    const controllerKey = controller ? `${controller.x},${controller.y}` : null

    // Build lookup sets for stationary points if provided
    const stationaryPointsSet = new Set<string>()
    const stationaryPointTypes = new Map<string, string>() // key -> type
    if (options?.stationaryPoints) {
        const sp = options.stationaryPoints
        Object.values(sp.sources).forEach((pos) => {
            const key = `${pos.x},${pos.y}`
            stationaryPointsSet.add(key)
            stationaryPointTypes.set(key, 'source-harvester')
        })
        if (sp.mineral) {
            const key = `${sp.mineral.x},${sp.mineral.y}`
            stationaryPointsSet.add(key)
            stationaryPointTypes.set(key, 'mineral-harvester')
        }
        if (sp.controllerLink) {
            const key = `${sp.controllerLink.x},${sp.controllerLink.y}`
            stationaryPointsSet.add(key)
            stationaryPointTypes.set(key, 'controller-upgrader')
        }
        if (sp.storageLink) {
            const key = `${sp.storageLink.x},${sp.storageLink.y}`
            stationaryPointsSet.add(key)
            stationaryPointTypes.set(key, 'storage-link-hauler')
        }
    }

    // Build lookup sets for links if provided
    const linkPositions = new Set<string>()
    if (options?.links) {
        const l = options.links
        linkPositions.add(`${l.controller.x},${l.controller.y}`)
        linkPositions.add(`${l.storage.x},${l.storage.y}`)
        l.sourceContainers.forEach((sc) => {
            linkPositions.add(`${sc.link.x},${sc.link.y}`)
        })
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
        `  ${chalk.bgRgb(50, 50, 50)('  ')} Walls: ${chalk.yellow(wallCount.toString())} tiles`,
    )
    lines.push(
        `  ${chalk.bgRgb(40, 60, 40)('  ')} Swamps: ${chalk.yellow(swampCount.toString())} tiles`,
    )
    lines.push(`  Plains: ${chalk.yellow(plainCount.toString())} tiles`)

    // Structure counts
    lines.push(chalk.bold('\n📊 Structure Summary:'))
    const structureCounts = new Map<string, number>()
    for (const [type, positions] of result.buildings.entries()) {
        structureCounts.set(type, positions.length)
    }

    // Sort by count descending
    const sortedStructures = Array.from(structureCounts.entries()).sort((a, b) => b[1] - a[1])
    for (const [type, count] of sortedStructures) {
        const symbol = getStructureSymbol(type)
        const color = getStructureColor(type)
        lines.push(`  ${color(symbol)} ${chalk.white(type)}: ${chalk.yellow(count.toString())}`)
    }

    // Render room grid
    lines.push(chalk.bold('\n🗺️  Room Layout:'))

    // Column header (00-49) - outside border
    let header = '     '
    for (let x = 0; x < 50; x++) {
        header += chalk.dim(x.toString().padStart(2, '0'))
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
            const buildingTypes = buildingMap.get(key) || []
            const terrainType = terrain.get(x, y)
            const isSource = sourcePositions.has(key)
            const mineralType = mineralMap.get(key)
            const isController = key === controllerKey
            const isStationaryPoint = stationaryPointsSet.has(key)
            const stationaryType = stationaryPointTypes.get(key)

            line += renderCell(
                buildingTypes,
                terrainType,
                isSource,
                mineralType,
                isController,
                isStationaryPoint,
                stationaryType,
            )
        }

        line += chalk.dim('║')
        lines.push(line)
    }

    // Bottom border
    let bottomBorder = '   ╚'
    for (let x = 0; x < 50; x++) {
        bottomBorder += '══'
    }
    bottomBorder += '╝'
    lines.push(chalk.dim(bottomBorder))

    // Legend
    lines.push(chalk.bold('\n🔑 Legend:'))
    lines.push(
        `  Terrain: ${chalk.bgRgb(50, 50, 50)('  ')} Wall   ${chalk.bgRgb(40, 60, 40)('  ')} Swamp`,
    )
    lines.push(
        `  Natural: ${chalk.bgWhite(chalk.yellow.bold('◉'))} Source   ${chalk.bgWhite(
            chalk.cyan.bold('X'),
        )} Mineral (H/O/U/etc)   ${chalk.bgWhite(chalk.magenta.bold('⚙'))} Controller`,
    )
    if (options?.stationaryPoints) {
        lines.push(
            `  Stationary: ${chalk.bgBlue(
                chalk.yellow.bold('◎'),
            )} Source Harvester   ${chalk.bgBlue(
                chalk.cyan.bold('⊕'),
            )} Mineral Harvester   ${chalk.bgBlue(
                chalk.magenta.bold('⚡'),
            )} Controller Upgrader   ${chalk.bgBlue(chalk.blue.bold('⊙'))} Storage Link Hauler`,
        )
    }
    lines.push(
        `  Structures: ${chalk.bgGreen('  ')} Rampart   ${chalk.yellow.bold(
            'S',
        )} Spawn   ${chalk.red.bold('T')} Tower   ${chalk.white.bold('E')} Extension`,
    )
    if (options?.links) {
        lines.push(`  ${chalk.magenta.bold('L')} Link (energy transfer network)`)
    }

    lines.push(chalk.bold.cyan(`\n═══════════════════════════════════════════════════════\n`))

    return lines.join('\n')
}

/**
 * Render a cell with terrain and structures (2 characters wide)
 */
function renderCell(
    buildingTypes: string[],
    terrainType: number,
    isSource: boolean,
    mineralType: string | undefined,
    isController: boolean,
    isStationaryPoint: boolean,
    stationaryType: string | undefined,
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

    // Stationary points get blue background with specific symbols
    if (isStationaryPoint && stationaryType) {
        let symbol: string
        let color: (s: string) => string

        switch (stationaryType) {
            case 'source-harvester':
                symbol = '◎'
                color = chalk.yellow.bold
                break
            case 'mineral-harvester':
                symbol = '⊕'
                color = chalk.cyan.bold
                break
            case 'controller-upgrader':
                symbol = '⚡'
                color = chalk.magenta.bold
                break
            case 'storage-link-hauler':
                symbol = '⊙'
                color = chalk.blue.bold
                break
            default:
                symbol = '●'
                color = chalk.white.bold
        }

        return chalk.bgBlue(color(symbol) + ' ')
    }

    // Check if there's a rampart
    const hasRampart = buildingTypes.includes('rampart')

    // Get the non-rampart structure (if any)
    const structure = buildingTypes.find((type) => type !== 'rampart')

    // Determine background color
    let bg: (s: string) => string
    if (hasRampart) {
        // Ramparts override terrain background with green
        bg = chalk.bgGreen
    } else {
        // Use terrain background
        switch (terrainType) {
            case 1: // Wall (TERRAIN_MASK_WALL = 1)
                bg = chalk.bgRgb(50, 50, 50) // Dark gray
                break
            case 2: // Swamp (TERRAIN_MASK_SWAMP = 2)
                bg = chalk.bgRgb(40, 60, 40) // Dark green
                break
            default:
                // Plain - use default terminal background
                bg = (s: string) => s
                break
        }
    }

    // Render the structure symbol (or empty space)
    if (structure) {
        const symbol = getStructureSymbol(structure)
        const color = getStructureColor(structure)
        return bg(color(symbol) + ' ')
    } else {
        return bg('  ')
    }
}

/**
 * Get a single-character symbol for a structure type
 */
function getStructureSymbol(type: string): string {
    const symbols: Record<string, string> = {
        spawn: 'S',
        extension: 'E',
        road: '·',
        wall: '█',
        rampart: 'R',
        link: 'L',
        storage: '$',
        tower: 'T',
        observer: 'O',
        powerSpawn: 'P',
        extractor: 'X',
        lab: 'A',
        terminal: 'M',
        container: 'C',
        nuker: 'N',
        factory: 'F',
    }
    return symbols[type] || '?'
}

/**
 * Get chalk color function for a structure type
 */
function getStructureColor(type: string): (s: string) => string {
    const colors: Record<string, (s: string) => string> = {
        spawn: chalk.yellow.bold,
        extension: chalk.white.bold,
        road: chalk.gray,
        wall: chalk.white,
        rampart: chalk.green,
        link: chalk.magenta.bold, // Magenta for links (energy network)
        storage: chalk.blue.bold,
        tower: chalk.red.bold,
        observer: chalk.magenta,
        powerSpawn: chalk.red,
        extractor: chalk.gray,
        lab: chalk.magenta,
        terminal: chalk.blue.bold,
        container: chalk.yellow,
        nuker: chalk.red.bold,
        factory: chalk.blue.bold,
    }
    return colors[type] || chalk.white
}
