/* eslint @typescript-eslint/no-explicit-any: "off" */

export interface Task<T> {
    readonly id: string
    readonly type: T
    readonly timestamp: number
    complete: boolean
}

export type TaskMemory = { [id: string]: Task<any> }

export interface Runner<T extends Task<any>> {
    verifyType: (task: Task<any>) => task is T
    run: (task: T, creep: LogisticsCreep) => boolean
    cleanup: (task: T) => boolean
}
