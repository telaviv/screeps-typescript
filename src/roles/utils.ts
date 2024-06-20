import * as Logger from 'utils/logger'
import { ResourceCreep } from 'tasks/types'

export function getHome(creep: ResourceCreep): Room | null {
    if (!creep.memory.home) {
        Logger.error('task:pickup::makeRequest:failure:no-home', creep.name)
        return null
    }
    return Game.rooms[creep.memory.home]
}
