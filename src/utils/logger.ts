/* eslint @typescript-eslint/no-explicit-any: ["off"] */

const LOG_LEVELS = ['error', 'warning', 'info', 'debug']

export function warning(...args: any[]) {
    logForLevel('warning', ...args)
}

export function info(...args: any[]) {
    logForLevel('info', ...args)
}

export function debug(...args: any) {
    logForLevel('debug', ...args)
}

function logForLevel(level: string, ...args: any[]) {
    const currentLogIndex = LOG_LEVELS.findIndex(l => l === Memory.logLevel)
    const requestedLogIndex = LOG_LEVELS.findIndex(l => l === level)
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

export function setLogLevel(level: string) {
    if (LOG_LEVELS.findIndex(l => l === level) === -1) {
        throw new Error(`level ${level} isn't a valid log level`)
    }
    Memory.logLevel = level
}
