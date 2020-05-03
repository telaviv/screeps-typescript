declare global {
    interface Memory {
        autoincrement: number
    }
}

if (!Memory.autoincrement) {
    Memory.autoincrement = 0
}

export default function autoIncrement() {
    Memory.autoincrement++
    if (Memory.autoincrement >= Number.MAX_SAFE_INTEGER) {
        Memory.autoincrement = 0
    }
    return Memory.autoincrement
}
