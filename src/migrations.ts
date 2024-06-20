declare global {
    interface Memory {
        version: string
    }
}

export default function migrate(): void {
    if (!Memory.version) {
        Memory.version = '1.0.0'
    }
}
