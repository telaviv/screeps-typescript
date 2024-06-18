declare global {
    namespace NodeJS {
        interface Global {
            roomSearch: typeof roomSearch
        }
    }
}

type RoomSearchResults = {
    name: string
    depth: number
}[]

export function roomSearch(
    roomNames: string[],
    maxDepth = 3,
): RoomSearchResults {
    const results: RoomSearchResults = []
    const visited: { [name: string]: boolean } = {}
    const queue: { name: string; depth: number }[] = roomNames.map((name) => ({
        name,
        depth: 0,
    }))

    while (queue.length > 0) {
        const { name, depth } = queue.shift()!
        if (visited[name]) {
            continue
        }
        visited[name] = true

        results.push({ name, depth })

        if (depth <= maxDepth) {
            const room = Game.rooms[name]
            if (room) {
                const exits = room.find(FIND_EXIT)
                for (const exit of exits) {
                    queue.push({ name: exit.roomName, depth: depth + 1 })
                }
            }
        }
    }

    return results
}

global.roomSearch = roomSearch
