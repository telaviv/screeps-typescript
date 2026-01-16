/**
 * Simple pub-sub system using global memory.
 * Allows components to communicate without direct dependencies.
 */
import * as Logger from '../utils/logger'
type SubscriptionCallback = (data: unknown) => void

declare global {
    namespace NodeJS {
        interface Global {
            pubsub: { [key: string]: { [id: string]: SubscriptionCallback } }
        }
    }
}

/**
 * Registers a callback for a specific event type and key.
 * @param type - Event category (e.g., SubscriptionEvent.CONSTRUCTION_FEATURES_UPDATES)
 * @param key - Specific identifier (e.g., room name)
 * @param id - Unique subscriber ID to prevent duplicate subscriptions
 */
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
