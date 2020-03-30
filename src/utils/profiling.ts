/* eslint @typescript-eslint/no-explicit-any: ["off"] */

export function wrap(fn: any, key: string): any {
    return (...args: any[]) => {
        const startCpu = Game.cpu.getUsed()
        const ret = fn(...args)
        const stopCpu = Game.cpu.getUsed()
        markProfileMemory(key, stopCpu - startCpu)
        return ret
    }
}

function markProfileMemory(key: string, time: number) {
    if (!Memory.profiler) {
        init()
    }

    if (!Memory.profiler.recording) {
        return
    }

    const data = Memory.profiler.data
    if (!data[key]) {
        data[key] = { total: 0, calls: 0 }
    }
    data[key].total += time
    data[key].calls += 1
}

export function start() {
    Memory.profiler.recording = true
    Memory.profiler.start = Game.time
}

export function stop() {
    Memory.profiler.recording = false
}

export function init() {
    if (!Memory.profiler) {
        Memory.profiler = { recording: false, data: {} }
    }
}

export function clear() {
    Memory.profiler.data = {}
}

export function output() {
    if (!Memory.profiler.start) {
        console.log('process never started')
        return
    }
    const totalTicks = Game.time - Memory.profiler.start
    for (const [key, data] of Object.entries(Memory.profiler.data)) {
        console.log(
            `${key}: ${data.total / totalTicks} ${data.total / data.calls}`,
        )
    }
}
