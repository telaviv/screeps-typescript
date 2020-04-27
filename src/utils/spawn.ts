import includes from 'lodash/includes'
import * as Logger from 'utils/logger'

export function spawnCreep(
    spawn: StructureSpawn,
    body: BodyPartConstant[],
    name: string,
    opts?: SpawnOptions,
): ScreepsReturnCode {
    const err = spawn.spawnCreep(body, name, opts)
    if (!includes([OK, ERR_BUSY], err)) {
        Logger.warning('spawnCreep:failed', err)
    }
    return err
}
