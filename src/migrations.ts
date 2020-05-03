declare global {
    interface Memory {
        version: string
    }
}

export default function migrate() {
    if (!Memory.version) {
        Memory.version = '1.0.0'
    }
}
