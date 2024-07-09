/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */

import sizeof from 'object-sizeof'
import { table } from 'table'

interface ProfilerData {
    [key: string]: { total: number; calls: number }
}

interface ProfilerMemory {
    recording: boolean
    data: ProfilerData
    start?: number
    stop?: number
}

declare global {
    interface Memory {
        profiler: ProfilerMemory
    }
    namespace NodeJS {
        interface Global {
            calculateMemory: () => void
        }
    }
}

export function start(): void {
    Memory.profiler.recording = true
    Memory.profiler.start = Game.time
}

export function stop(): void {
    Memory.profiler.recording = false
    Memory.profiler.stop = Game.time
}

export function init(): void {
    if (!Memory.profiler) {
        Memory.profiler = { recording: false, data: {} }
    }
}

export function clear(): void {
    Memory.profiler.data = {}
    Memory.profiler.recording = false
}

declare global {
    // Syntax for adding proprties to `global` (ex "global.log")
    namespace NodeJS {
        interface Global {
            initProfiler: () => void
            startProfiler: () => void
            stopProfiler: () => void
            clearProfiler: () => void
            outputProfiler: () => void
        }
    }
}

global.initProfiler = init
global.startProfiler = start
global.stopProfiler = stop
global.clearProfiler = clear
global.outputProfiler = output

export function wrap<T extends (...args: any[]) => any>(
    fn: T,
    key: string,
): (...funcArgs: Parameters<T>) => ReturnType<T> {
    return (...args: Parameters<T>): ReturnType<T> => {
        const startCpu = Game.cpu.getUsed()
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        const ret = fn(...args)
        const stopCpu = Game.cpu.getUsed()
        markProfileMemory(key, stopCpu - startCpu)
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return
        return ret
    }
}

export function mprofile(key: string) {
    // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
    return (target: any, propertyKey: string, descriptor: PropertyDescriptor): any => {
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

// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export function profile(target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value
    // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
    const key = `${target.constructor.name}:${propertyKey}`
    descriptor.value = function (...args: any) {
        const startCpu = Game.cpu.getUsed()
        const ret = originalMethod.apply(this, args)
        const stopCpu = Game.cpu.getUsed()
        markProfileMemory(key, stopCpu - startCpu)
        return ret
    }
    // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
}

export function output(): void {
    if (!Memory.profiler.start) {
        console.log('process never started')
        return
    }

    if (!Memory.profiler.stop) {
        console.log('process never stopped')
        return
    }
    const totalTicks = Memory.profiler.stop - Memory.profiler.start
    const dataArray = Object.entries(Memory.profiler.data)
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    dataArray.sort(([_, dataa], [__, datab]) => datab.total - dataa.total)
    const outputData = []
    for (const [key, data] of dataArray.slice(0, 30)) {
        outputData.push([
            key,
            data.total / totalTicks,
            data.total / data.calls,
            data.calls / totalTicks,
            data.total,
        ])
    }
    console.log(table(outputData))
}

const calculateMemory = () => {
    console.log(`Memory used: ${sizeof(Memory) / 1024} KB`)
}

global.calculateMemory = calculateMemory
