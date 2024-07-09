import * as Logger from './logger'

const TIME_CACHE: Map<number, Map<string, unknown>> = new Map()

export function get<T>(key: string, ttl: number, fn: () => T): T {
    const now = Game.time
    if (!TIME_CACHE.has(now)) {
        TIME_CACHE.set(now, new Map())
    }
    const cache = TIME_CACHE.get(now) as Map<string, unknown>
    if (!cache.has(key)) {
        cache.set(key, fn())
    }
    return cache.get(key) as T
}

export function clearRecord(key: string): void {
    const now = Game.time
    if (TIME_CACHE.has(now)) {
        const cache = TIME_CACHE.get(now) as Map<string, unknown>
        cache.delete(key)
    }
    Logger.warning('time-cache:clear-record:key-not-found', key)
}

export function clearAll(): void {
    TIME_CACHE.clear()
}
