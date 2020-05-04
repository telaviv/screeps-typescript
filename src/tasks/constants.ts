export interface Task<T> {
    readonly id: string
    readonly type: T
    readonly timestamp: number
    complete: boolean
}

export type TaskMemory = { [id: string]: Task<any> }
