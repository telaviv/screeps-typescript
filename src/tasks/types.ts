export interface Task<T> {
    readonly id: string
    readonly type: T
    readonly timestamp: number
    complete: boolean
}

export type TaskMemory = { [id: string]: Task<any> }

interface Runner<T> {
    type: T
    run: (creep: LogisticsCreep, task: Task<T>) => boolean
    cleanup: (task: Task<T>) => boolean
}
