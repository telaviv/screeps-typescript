/**
 * Helper script to download terrain data from Screeps API and save as a fixture
 * Usage: ts-node -r tsconfig-paths/register scripts/download-terrain.ts <room-name> <shard>
 */

const fs = require('fs')
const path = require('path')
const { ScreepsAPI } = require('screeps-api')

interface TerrainFixture {
    roomName: string
    terrain: number[][] // 50x50 grid, 0=plain, 1=wall, 2=swamp
    sources: Array<{ x: number; y: number }>
    controller: { x: number; y: number } | null
}

async function downloadTerrain(roomName: string, shard: string) {
    // Load screeps.json config
    const configPath = path.join(__dirname, '..', 'screeps.json')
    if (!fs.existsSync(configPath)) {
        throw new Error('screeps.json not found')
    }

    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'))
    const serverConfig = config.main

    if (!serverConfig) {
        throw new Error('No "main" server config found in screeps.json')
    }

    console.log(`Connecting to ${serverConfig.hostname}...`)

    // Initialize API
    const api = new ScreepsAPI({
        token: serverConfig.token,
        protocol: serverConfig.protocol,
        hostname: serverConfig.hostname,
        port: serverConfig.port,
        path: serverConfig.path || '/',
    })

    console.log(`Downloading terrain for ${roomName} on shard ${shard}...`)

    // Download terrain
    const terrainResponse: any = await api.raw.game.roomTerrain(roomName, shard)

    // Parse terrain into 50x50 grid
    const terrain: number[][] = Array.from({ length: 50 }, () =>
        Array.from({ length: 50 }, () => 0),
    )

    // Terrain data comes as a single string of 2500 characters (50x50)
    // Each character is: '0' = plain, '1' = wall, '2' = swamp
    if (terrainResponse.terrain && terrainResponse.terrain[0]) {
        const terrainString = terrainResponse.terrain[0].terrain
        for (let i = 0; i < terrainString.length; i++) {
            const x = i % 50
            const y = Math.floor(i / 50)
            terrain[y][x] = parseInt(terrainString[i]) // Store as terrain[y][x] for row-major indexing
        }
    }

    console.log(`Downloading room objects for ${roomName}...`)

    // Get room details including objects
    const roomDetailsResponse: any = await api.raw.game.roomObjects(roomName, shard)

    const sources: Array<{ x: number; y: number }> = []
    let controller: { x: number; y: number } | null = null

    if (roomDetailsResponse.objects) {
        for (const obj of roomDetailsResponse.objects) {
            if (obj.type === 'source') {
                sources.push({ x: obj.x, y: obj.y })
            } else if (obj.type === 'controller') {
                controller = { x: obj.x, y: obj.y }
            }
        }
    }

    const fixture: TerrainFixture = {
        roomName,
        terrain,
        sources,
        controller,
    }

    // Save to fixtures directory
    const fixturesDir = path.join(__dirname, '..', 'test', 'fixtures', 'terrain')
    if (!fs.existsSync(fixturesDir)) {
        fs.mkdirSync(fixturesDir, { recursive: true })
    }

    const outputPath = path.join(fixturesDir, `${roomName}.json`)
    fs.writeFileSync(outputPath, JSON.stringify(fixture, null, 2))

    console.log(`✓ Terrain fixture saved to ${outputPath}`)
    console.log(`  Sources: ${sources.length}`)
    console.log(`  Controller: ${controller ? 'Yes' : 'No'}`)
}

// Parse command line arguments
const roomName = process.argv[2]
const shard = process.argv[3] || 'shard0'

if (!roomName) {
    console.error('Usage: ts-node scripts/download-terrain.ts <room-name> [shard]')
    process.exit(1)
}

downloadTerrain(roomName, shard)
    .then(() => {
        console.log('Done!')
        process.exit(0)
    })
    .catch((error) => {
        console.error('Error:', error.message)
        process.exit(1)
    })
