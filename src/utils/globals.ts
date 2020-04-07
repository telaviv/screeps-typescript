function killAllCreeps(roomName: string) {
    Object.values(Game.creeps).forEach(creep => {
        if (creep.room.name === roomName) {
            creep.suicide()
        }
    })
}

export default function assignGlobals() {
    global.killAllCreeps = killAllCreeps
}
