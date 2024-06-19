import { Task } from '../types'
import { FlatRoomPosition } from 'types'

export interface MiningTask extends Task<'mining'> {
    type: 'mining'
    creep: string
    source: Id<Source>
    pos: FlatRoomPosition
}
