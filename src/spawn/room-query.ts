import * as TimeCache from '../utils/time-cache'
import { getCreeps, getLogisticsCreeps } from 'utils/creep'
import BuildManager from 'managers/build-manager'
import { LogisticsPreference } from 'roles/logistics-constants'
import { getLinks } from 'utils/room'
import { getTotalDroppedResources } from 'tasks/pickup'
import { profile } from 'utils/profiling'

export default class RoomQuery {
    private room: Room

    constructor(room: Room) {
        this.room = room
    }

    private key(key: string): string {
        return `${this.room.name}:${key}`
    }

    @profile
    public allRoadsBuilt(): boolean {
        return TimeCache.get(this.key('allRoadsBuilt'), () => BuildManager.allRoadsBuilt(this.room))
    }

    public linkCount(): number {
        return TimeCache.get(this.key('linkCount'), () => getLinks(this.room).length)
    }

    @profile
    public getCreepCount(role: string): number {
        return TimeCache.get(
            this.key(`creepCount:${role}`),
            () => getCreeps(role, this.room).length,
        )
    }

    @profile
    public getLogisticsCreepCount(opts: { preference?: LogisticsPreference }): number {
        const preference = opts.preference ?? 'any'
        return TimeCache.get(
            this.key(`creepCount:logistics:${preference}`),
            () => getLogisticsCreeps({ room: this.room, preference: opts.preference }).length,
        )
    }

    @profile
    public getWorkerLogisticsCreepCount(): number {
        return TimeCache.get(
            this.key('creepCount:worker-logistics'),
            () =>
                getLogisticsCreeps({ room: this.room }).filter((creep) =>
                    creep.getActiveBodyparts(WORK),
                ).length,
        )
    }

    @profile
    public getDroppedResourceCount(): number {
        return TimeCache.get(this.key('droppedResourceCount'), () =>
            getTotalDroppedResources(this.room),
        )
    }
}
