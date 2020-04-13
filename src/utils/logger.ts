/* eslint @typescript-eslint/no-explicit-any: ["off"] */

export function warning(...args: any[]) {
    const normalized = args.map((arg: any) => {
        if (typeof arg !== 'string') {
            return JSON.stringify(arg)
        }
        return arg
    })
    console.log(`[${Game.time}]`, ...normalized)
}

export function info(...args: any[]) {
    const normalized = args.map((arg: any) => {
        if (typeof arg !== 'string') {
            return JSON.stringify(arg)
        }
        return arg
    })
    console.log(`[${Game.time}]`, ...normalized)
}

export function debug(...args: any) {
    const normalized = args.map((arg: any) => {
        if (typeof arg !== 'string') {
            return JSON.stringify(arg)
        }
        return arg
    })
    console.log(`[${Game.time}]`, ...normalized)
}
