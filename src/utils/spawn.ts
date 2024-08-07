import * as Logger from 'utils/logger'
import autoIncrement from 'utils/autoincrement'
import includes from 'lodash/includes'

export function spawnCreep(
    spawn: StructureSpawn,
    body: BodyPartConstant[],
    name: string,
    room: string,
    opts?: SpawnOptions,
): ScreepsReturnCode {
    const uniqueName = createName(name, room)
    const err = spawn.spawnCreep(body, uniqueName, opts)
    if (!includes([OK, ERR_BUSY, ERR_NOT_ENOUGH_ENERGY], err)) {
        Logger.warning('spawnCreep:failed', err, JSON.stringify(body), uniqueName)
    }
    return err
}

function createName(namePrefix: string, room: string) {
    return `${namePrefix}:${room}:${autoIncrement()}`
}
