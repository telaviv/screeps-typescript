import { MinePathEntry } from 'construction-features'

declare global {
    interface Memory {
        remoteHaulerDebugEnabled?: boolean
    }
}
import * as Logger from 'utils/logger'

/**
 * Converts a (dx, dy) delta between adjacent grid tiles to a Screeps DirectionConstant.
 * Both dx and dy must be in {-1, 0, 1}.
 */
export function deltaToDirection(dx: number, dy: number): DirectionConstant {
    if (dx === 0 && dy === -1) return TOP
    if (dx === 1 && dy === -1) return TOP_RIGHT
    if (dx === 1 && dy === 0) return RIGHT
    if (dx === 1 && dy === 1) return BOTTOM_RIGHT
    if (dx === 0 && dy === 1) return BOTTOM
    if (dx === -1 && dy === 1) return BOTTOM_LEFT
    if (dx === -1 && dy === 0) return LEFT
    return TOP_LEFT // dx === -1 && dy === -1
}

/** Returns the direction directly opposite to the given direction. */
export function getOppositeDirection(dir: DirectionConstant): DirectionConstant {
    // Directions are 1–8. Opposite is (dir + 3) % 8 + 1.
    return (((dir - 1 + 4) % 8) + 1) as DirectionConstant
}

/**
 * Follows a stored mine path using creep.move(direction).
 *
 * The creep must be exactly on a step in the path (current room, exact x/y match).
 * If it is, moves in path[next].direction. Returns ERR_NOT_FOUND otherwise so the
 * caller can fall back to cartographer.
 *
 * Each MinePathEntry.direction is the direction you move to ARRIVE at that entry
 * from the previous one, so the cross-room exit direction is always correct.
 */
export function followMinePath(
    creep: Creep,
    path: MinePathEntry[],
    label: string,
): ScreepsReturnCode {
    if (path.length === 0) {
        if (Memory.remoteHaulerDebugEnabled) {
            console.log('followMinePath', label, creep.name, creep.pos, 'empty-path')
        }
        return ERR_NOT_FOUND
    }

    const { x, y, roomName } = creep.pos

    const idx = path.findIndex((step) => step.roomName === roomName && step.x === x && step.y === y)
    if (idx === -1) {
        if (Memory.remoteHaulerDebugEnabled) {
            console.log('followMinePath', label, creep.name, creep.pos, 'not-on-path')
        }
        return ERR_NOT_FOUND
    }

    const nextIdx = idx + 1
    if (nextIdx >= path.length) {
        if (Memory.remoteHaulerDebugEnabled) {
            console.log('followMinePath', label, creep.name, creep.pos, 'path-exhausted', idx)
        }
        return ERR_NOT_FOUND // path exhausted — caller uses moveTo for the last tile
    }

    // path[idx].direction = direction from path[idx] → path[idx+1] (set by pathToMinePathEntries)
    const current = path[idx]
    const next = path[nextIdx]
    const result = creep.move(current.direction)
    if (Memory.remoteHaulerDebugEnabled) {
        console.log(
            'followMinePath',
            label,
            creep.name,
            creep.pos,
            `idx=${idx}→${nextIdx}`,
            `dir=${current.direction}`,
            `next=(${next.x},${next.y},${next.roomName})`,
            `result=${result}`,
        )
    }
    return result
}

/**
 * Filters a MinePathEntry[] to only entries in `roomName` and returns them as PathStep[].
 * MinePathEntry already contains all PathStep fields (x, y, dx, dy, direction).
 */
export function getMineRoomPathSteps(path: MinePathEntry[], roomName: string): PathStep[] {
    return path
        .filter((e) => e.roomName === roomName)
        .map(({ x, y, dx, dy, direction }) => ({ x, y, dx, dy, direction }))
}

/**
 * Reverses a MinePathEntry[] for travelling in the opposite direction.
 * Reverses the array order and flips each entry's dx, dy, and direction.
 */
export function reverseMinePath(path: MinePathEntry[]): MinePathEntry[] {
    const reversed = path.slice().reverse()
    return reversed.map((entry, i) => {
        // The direction for this step points toward reversed[i+1].
        // That is the opposite direction of the original step that pointed TO this tile.
        // We derive it from the next entry in the reversed array (= previous in original).
        const next = reversed[i + 1]
        if (!next) {
            // Last step: no next tile, direction/dx/dy are unused by moveByPath.
            return { ...entry, dx: 0, dy: 0, direction: entry.direction }
        }
        let ndx: -1 | 0 | 1
        let ndy: -1 | 0 | 1
        if (entry.roomName !== next.roomName) {
            // Cross-room: coordinate deltas are unreliable (e.g. y=0→y=49 gives +49 but
            // the exit direction is TOP). Derive from which edge the current tile is on.
            ndx = entry.x === 49 ? 1 : entry.x === 0 ? -1 : 0
            ndy = entry.y === 49 ? 1 : entry.y === 0 ? -1 : 0
        } else {
            ndx = Math.sign(next.x - entry.x) as -1 | 0 | 1
            ndy = Math.sign(next.y - entry.y) as -1 | 0 | 1
        }
        return {
            ...entry,
            dx: ndx,
            dy: ndy,
            direction: deltaToDirection(ndx, ndy),
        }
    })
}

/** Returns the minePaths key for the base storageLink → mine source container path. */
export function getSourcePathKey(mineRoom: string, sourceId: string): string {
    return `storage:source-${mineRoom}-${sourceId}`
}

/**
 * Returns the minePaths key for the source-container ↔ source-container path.
 * IDs are sorted alphabetically so the key is the same regardless of argument order.
 */
export function getSourceToSourceKey(mineRoom: string, idA: string, idB: string): string {
    const [lower, upper] = idA < idB ? [idA, idB] : [idB, idA]
    return `source-${mineRoom}-${lower}:source-${mineRoom}-${upper}`
}

/**
 * Returns true when the stored source-to-source path must be reversed to travel from idA → idB.
 * The stored path always goes from the alphabetically-lower id to the higher id.
 */
export function isSourceToSourceReversed(idA: string, idB: string): boolean {
    return idA > idB
}
