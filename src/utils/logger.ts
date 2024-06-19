/* eslint @typescript-eslint/no-explicit-any: ["off"] */

const LOG_LEVELS = ['error', 'warning', 'info', 'debug']

declare global {
    interface Memory {
        logLevel: string
    }
}

export function error(...args: any[]): void {
    logForLevel('error', 'red', ...args)
}

export function warning(...args: any[]): void {
    logForLevel('warning', 'yellow', ...args)
}

export function info(...args: any[]): void {
    logForLevel('info', 'white', ...args)
}

export function debug(...args: any[]): void {
    logForLevel('debug', 'green', ...args)
}

function logForLevel(level: string, color: string, ...args: any[]) {
    const currentLogIndex = LOG_LEVELS.findIndex((l) => l === Memory.logLevel)
    const requestedLogIndex = LOG_LEVELS.findIndex((l) => l === level)
    if (requestedLogIndex > currentLogIndex) {
        return
    }
    const normalized = args.map((arg: any) => {
        if (typeof arg !== 'string') {
            return JSON.stringify(arg)
        }
        return arg
    })
    console.log(`<span color="${color}">[${level}][${Game.time}]</span>`, ...normalized)
}

export function setLogLevel(level: string): void {
    if (LOG_LEVELS.findIndex((l) => l === level) === -1) {
        throw new Error(`level ${level} isn't a valid log level`)
    }
    Memory.logLevel = level
}
