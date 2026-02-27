import * as Logger from 'utils/logger'
import { ResourceCreep } from '../types'
import { TravelTask } from './types'
import autoIncrement from 'utils/autoincrement'
import { getConstructionFeaturesV3 } from 'construction-features'
import { isTravelTask } from './utils'
import { moveToRoom } from 'utils/travel'
import { wrap } from 'utils/profiling'

export const makeRequest = wrap((creep: ResourceCreep, destination: string): boolean => {
    addTravelTask(creep, destination)
    return true
}, 'travel:makeRequest')

const DIRECTION_OFFSETS: Record<DirectionConstant, [number, number]> = {
    [TOP]: [0, -1],
    [TOP_RIGHT]: [1, -1],
    [RIGHT]: [1, 0],
    [BOTTOM_RIGHT]: [1, 1],
    [BOTTOM]: [0, 1],
    [BOTTOM_LEFT]: [-1, 1],
    [LEFT]: [-1, 0],
    [TOP_LEFT]: [-1, -1],
}

function stepOffRoad(creep: ResourceCreep): void {
    const onRoad = creep.pos
        .lookFor(LOOK_STRUCTURES)
        .some((s) => s.structureType === STRUCTURE_ROAD)
    if (!onRoad) {
        return
    }
    const terrain = creep.room.getTerrain()
    for (const dir of [
        TOP,
        TOP_RIGHT,
        RIGHT,
        BOTTOM_RIGHT,
        BOTTOM,
        BOTTOM_LEFT,
        LEFT,
        TOP_LEFT,
    ] as DirectionConstant[]) {
        const [dx, dy] = DIRECTION_OFFSETS[dir]
        const x = creep.pos.x + dx
        const y = creep.pos.y + dy
        if (x < 1 || x > 48 || y < 1 || y > 48) {
            continue
        }
        if (terrain.get(x, y) === TERRAIN_MASK_WALL) {
            continue
        }
        const hasRoad = creep.room
            .lookForAt(LOOK_STRUCTURES, x, y)
            .some((s) => s.structureType === STRUCTURE_ROAD)
        if (!hasRoad) {
            creep.move(dir)
            return
        }
    }
}

/** Completes when creep reaches room center and construction features exist */
export const run = wrap((task: TravelTask, creep: ResourceCreep): boolean => {
    if (creep.room.name === task.destination && creep.pos.inRangeTo(25, 25, 23)) {
        if (getConstructionFeaturesV3(creep.room)) {
            if (task.permanent) {
                stepOffRoad(creep)
                return false
            }
            completeRequest(creep)
            return true
        }
        // In the destination room and in range but no construction features yet.
        // Permanent scouts stay put — calling moveToRoom risks ERR_NO_PATH completing the task.
        if (task.permanent) {
            return false
        }
    }
    const err = moveToRoom(creep, task.destination, {
        maxOps: 2000,
        reusePath: 100,
        ...(task.ignoreDenylist && {
            routeCallback: () => undefined,
            roomCallback: () => true as CostMatrix | boolean,
        }),
    })
    if (err === ERR_NO_PATH) {
        const blocked = Memory.pathBlockedRooms ?? {}
        blocked[task.destination] = Game.time
        Memory.pathBlockedRooms = blocked
        // Never complete a permanent task on ERR_NO_PATH — the scout should keep trying.
        if (task.permanent) {
            return false
        }
        completeRequest(creep)
        return true
    }
    return false
}, 'task:travel:run')

function addTravelTask(creep: ResourceCreep, destination: string): TravelTask {
    const task = createTravelTask(creep.name, destination)
    creep.memory.tasks.push(task)
    return task
}

/** Creates a travel task. If permanent=true, task never completes (for scouts) */
export function createTravelTask(
    creepName: string,
    destination: string,
    permanent = false,
    ignoreDenylist = false,
): TravelTask {
    return {
        type: 'travel',
        id: autoIncrement().toString(),
        creep: creepName,
        destination,
        timestamp: Game.time,
        permanent,
        ignoreDenylist: ignoreDenylist || undefined,
        complete: false,
    }
}

export function completeRequest(creep: ResourceCreep): void {
    if (!creep.memory.tasks || creep.memory.tasks.length === 0) {
        Logger.warning('task:travel::complete:failure', creep.name, creep.memory.tasks)
    }
    const task = creep.memory.tasks[0]
    task.complete = true
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function cleanup(task: TravelTask, creep: ResourceCreep): boolean {
    return false
}

export default {
    verifyType: isTravelTask,
    run,
    cleanup,
}
