/* eslint @typescript-eslint/no-unsafe-assignment: ["off"] */
/* eslint @typescript-eslint/no-unsafe-member-access: ["off"] */
/* eslint @typescript-eslint/no-unsafe-call: ["off"] */
/* eslint @typescript-eslint/no-unsafe-return: ["off"] */
/* eslint @typescript-eslint/restrict-template-expressions: ["off"] */
/* eslint func-names: "off" */
interface ProfilerData {
    [key: string]: { total: number; calls: number }
}

interface ProfilerMemory {
    recording: boolean
    data: ProfilerData
    start?: number
}

declare global {
    interface Memory {
        profiler: ProfilerMemory
    }
}

export function wrap<T extends (...args: any[]) => any>(
    fn: T,
    key: string,
): (...funcArgs: Parameters<T>) => ReturnType<T> {
    return (...args: Parameters<T>): ReturnType<T> => {
        const startCpu = Game.cpu.getUsed()
        const ret = fn(...args)
        const stopCpu = Game.cpu.getUsed()
        markProfileMemory(key, stopCpu - startCpu)
        return ret
    }
}

export function mprofile(key: string) {
    return (
        target: any,
        propertyKey: string,
        descriptor: PropertyDescriptor,
    ) => {
        const originalMethod = descriptor.value
        descriptor.value = function (...args: any) {
            const startCpu = Game.cpu.getUsed()
            const ret = originalMethod.apply(this, args)
            const stopCpu = Game.cpu.getUsed()
            markProfileMemory(key, stopCpu - startCpu)
            return ret
        }
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
    start()
}

export function profile(
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor,
) {
    const originalMethod = descriptor.value
    const key = `${target.constructor.name}.${propertyKey}`
    descriptor.value = function (...args: any) {
        const startCpu = Game.cpu.getUsed()
        const ret = originalMethod.apply(this, args)
        const stopCpu = Game.cpu.getUsed()
        markProfileMemory(key, stopCpu - startCpu)
        return ret
    }
}

export function output() {
    if (!Memory.profiler.start) {
        console.log('process never started')
        return
    }
    const totalTicks = Game.time - Memory.profiler.start
    const dataArray = Object.entries(Memory.profiler.data)
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    dataArray.sort(([keya, dataa], [keyb, datab]) => datab.total - dataa.total)
    for (const [key, data] of dataArray.slice(0, 10)) {
        console.log(
            `${key}: ${data.total / totalTicks} ${data.total / data.calls} ${data.calls / totalTicks
            }`,
        )
    }
}
