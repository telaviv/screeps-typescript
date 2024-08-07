/* eslint-disable no-underscore-dangle */

import { SourceMapConsumer } from 'source-map'
import { escape } from 'lodash'

export default class ErrorMapper {
    // Cache consumer
    private static _consumer?: SourceMapConsumer

    public static get consumer(): SourceMapConsumer {
        if (this._consumer == null) {
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            this._consumer = new SourceMapConsumer(require('main.js.map'))
        }

        return this._consumer
    }

    // Cache previously mapped traces to improve performance
    public static cache: { [key: string]: string } = {}

    /**
     * Generates a stack trace using a source map generate original symbol names.
     *
     * WARNING - EXTREMELY high CPU cost for first call after reset - >30 CPU! Use sparingly!
     * (Consecutive calls after a reset are more reasonable, ~0.1 CPU/ea)
     *
     * @param {Error | string} error The error or original stack trace
     * @returns {string} The source-mapped stack trace
     */
    public static sourceMappedStackTrace(error: Error | string): string {
        const stack: string = error instanceof Error ? (error.stack as string) : error
        if (Object.prototype.hasOwnProperty.call(this.cache, stack)) {
            return this.cache[stack]
        }

        // eslint-disable-next-line no-useless-escape
        const re = /^\s+at\s+(.+?\s+)?\(?([0-z._\-\\\/]+):(\d+):(\d+)\)?$/gm
        let match: RegExpExecArray | null
        let outStack = error.toString()

        while ((match = re.exec(stack))) {
            if (match[2] === 'main') {
                const pos = this.consumer.originalPositionFor({
                    column: parseInt(match[4], 10),
                    line: parseInt(match[3], 10),
                })

                if (pos.line != null) {
                    if (pos.name) {
                        outStack += `\n    at ${pos.name} (${pos.source}:${pos.line}:${pos.column})`
                    } else {
                        if (match[1]) {
                            // no original source file name known - use file name from given trace
                            outStack += `\n    at ${match[1]} (${pos.source}:${pos.line}:${pos.column})`
                        } else {
                            // no original source file name known or in given trace - omit name
                            outStack += `\n    at ${pos.source}:${pos.line}:${pos.column}`
                        }
                    }
                } else {
                    // no known position
                    break
                }
            } else {
                // no more parseable lines
                break
            }
        }

        this.cache[stack] = outStack
        return outStack
    }

    public static wrap(fn: (...args: any) => void): (...args: any) => void {
        return (...args: any) => {
            try {
                fn.apply(this, args)
            } catch (e) {
                if (e instanceof Error) {
                    if ('sim' in Game.rooms) {
                        const message = `Source maps don't work in the simulator - displaying original error`
                        console.log(
                            `<span style='color:red'>${message}<br>${escape(e.stack)}</span>`,
                        )
                    } else {
                        console.log(
                            `<span style='color:red'>${escape(
                                this.sourceMappedStackTrace(e),
                            )}</span>`,
                        )
                    }
                } else {
                    // can't handle it
                    throw e
                }
            }
        }
    }
}

/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/explicit-module-boundary-types */
export const trace = (target: any, propertyKey: string, descriptor: PropertyDescriptor) => {
    const originalMethod = descriptor.value
    descriptor.value = function (...args: any) {
        ErrorMapper.wrap(originalMethod.bind(this))(...args)
    }
}
