import { isResourceCreep } from "./types";

export function* getAllTasks() {
    for (const creep of Object.values(Game.creeps)) {
        if (isResourceCreep(creep)) {
            for (const task of creep.memory.tasks) {
                yield task
            }
        }
    }
}
