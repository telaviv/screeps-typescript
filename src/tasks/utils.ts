export function* getAllTasks() {
    for (const creepMemory of Object.values(Memory.creeps)) {
        if (creepMemory.tasks) {
            for (const task of creepMemory.tasks) {
                yield task
            }
        }
    }
}
