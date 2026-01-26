/* eslint @typescript-eslint/no-explicit-any: ["off"] */

const LOG_LEVELS = ['error', 'warning', 'info', 'debug']

declare global {
    interface Memory {
        logLevel: string
    }
}

export function error(...args: unknown[]): void {
    logForLevel('error', 'red', ...args)
}

export function warning(...args: unknown[]): void {
    logForLevel('warning', 'yellow', ...args)
}

export function info(...args: unknown[]): void {
    logForLevel('info', 'white', ...args)
}

export function debug(...args: unknown[]): void {
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
    console.log(`[${level}][${Game.time}]`, ...normalized)
}

export function setLogLevel(level: string): void {
    if (LOG_LEVELS.findIndex((l) => l === level) === -1) {
        throw new Error(`level ${level} isn't a valid log level`)
    }
    Memory.logLevel = level
}
