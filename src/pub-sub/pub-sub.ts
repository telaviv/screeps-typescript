import * as Logger from '../utils/logger'
type SubscriptionCallback = (data: unknown) => void

declare global {
    namespace NodeJS {
        interface Global {
            pubsub: { [key: string]: { [id: string]: SubscriptionCallback } }
        }
    }
}

export function subscribe(
    type: string,
    key: string,
    id: string,
    callback: (data: unknown) => void,
): void {
    const subscriptionKey = `${type}:${key}`
    if (!global.pubsub) {
        global.pubsub = {}
    }
    if (!global.pubsub[subscriptionKey]) {
        global.pubsub[subscriptionKey] = {}
    }
    global.pubsub[subscriptionKey][id] = callback
}

export function publish(type: string, key: string, data?: unknown): void {
    const subscriptionKey = `${type}:${key}`
    if (!global.pubsub || !global.pubsub[subscriptionKey]) {
        return
    }
    for (const [id, callback] of Object.entries(global.pubsub[subscriptionKey])) {
        Logger.info('publishing', type, key, id)
        callback(data)
    }
}
