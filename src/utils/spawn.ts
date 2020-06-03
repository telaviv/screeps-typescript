import autoIncrement from 'utils/autoincrement'
import includes from 'lodash/includes'
import * as Logger from 'utils/logger'

export function spawnCreep(
    spawn: StructureSpawn,
    body: BodyPartConstant[],
    name: string,
    room: string,
    opts?: SpawnOptions,
): ScreepsReturnCode {
    const err = spawn.spawnCreep(body, createName(name, room))
    if (!includes([OK, ERR_BUSY, ERR_NOT_ENOUGH_ENERGY], err)) {
        Logger.warning('spawnCreep:failed', err, name)
    }
    return err
}

function createName(namePrefix: string, room: string) {
    return `${namePrefix}:${room}:${autoIncrement()}`
}
