const OWNED_STRUCTURES = [STRUCTURE_SPAWN]
type spawn = 'spawn'

interface SimpleStructure {
    structureType: StructureConstant
    pos: FlatRoomPosition
    my: boolean
    owner: Owner
}

interface SimpleController {
    my: boolean
    owner: Owner
    isPowerEnabled: boolean
    level: number
    reservation?: ReservationDefinition
    safeMode?: number
    safeModeAvailable: number
    safeModeCooldown?: number
}

interface ScoutStatus {
    timestamp: number
    controller?: SimpleController
    structures: SimpleStructure[]
}

declare global {
    interface RoomMemory {
        scout?: ScoutStatus
    }
}

export function recordStatus(room: Room) {
    const controllerStatus = room.controller
        ? getControllerStatus(room.controller)
        : undefined
    const structureStatus = getStructuresStatus(room)
    room.memory.scout = {
        timestamp: Game.time,
        controller: controllerStatus,
        structures: structureStatus,
    }
}

function getControllerStatus(
    controller: StructureController,
): SimpleController {
    const {
        my,
        isPowerEnabled,
        level,
        reservation,
        safeMode,
        safeModeAvailable,
        safeModeCooldown,
        owner,
    } = controller

    return {
        my,
        isPowerEnabled,
        level,
        reservation,
        safeMode,
        safeModeAvailable,
        safeModeCooldown,
        owner,
    }
}

function getStructuresStatus(room: Room): SimpleStructure[] {
    const spawns = room.find<StructureSpawn>(FIND_STRUCTURES, {
        filter: s => s.structureType === STRUCTURE_SPAWN,
    })
    return spawns.map(getStructureStatus)
}

function getStructureStatus(structure: OwnedStructure): SimpleStructure {
    const { structureType, pos, my, owner } = structure
    return { structureType, pos, my, owner }
}
