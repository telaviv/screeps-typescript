import * as MiningTask from "tasks/mining";
import * as WithdrawTask from "tasks/withdraw";
import * as PickupTask from "tasks/pickup";
import * as Logger from "utils/logger";
import { ResourceCreep } from "./types";


export function addEnergyTask(creep: ResourceCreep): boolean {
    const taskMap = [
        { tasker: PickupTask, name: 'pickup' },
        { tasker: WithdrawTask, name: 'withdraw' },
        { tasker: MiningTask, name: 'mining' }
    ];
    for (const { tasker, name } of taskMap) {
        const ret = tasker.makeRequest(creep);
        if (ret) {
            if (creep.memory.tasks.length === 0) {
                Logger.error('addEnergyTask:failureToMakeTask', name, creep.name);
                return false;
            } else {
                return true;
            }
        }
    }
    Logger.debug('addEnergyTask:failure', 'no tasks could be made', creep.name);
    return false;
}
