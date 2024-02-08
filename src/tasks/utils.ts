import autoIncrement from "utils/autoincrement";
import { Task, isResourceCreep } from "./types";

export function* getAllTasks() {
    for (const creep of Object.values(Game.creeps)) {
        if (isResourceCreep(creep)) {
            for (const task of creep.memory.tasks) {
                if (task === undefined) {
                    throw new Error(`undefined task: creep.name`)
                }
                yield task
            }
        }
    }
}

export function makeTask<T>(type: T, data: Object): Task<T> {
    return {
        type,
        id: autoIncrement().toString(),
        timestamp: Game.time,
        complete: false,
        ...data,
    }
}

export function findTaskByType<T>(type: T): Task<T> | undefined {
    for (const task of getAllTasks()) {
        if (task.type === type) {
            return task
        }
    }
    return undefined
}


