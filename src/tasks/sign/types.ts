import { Task } from '../types'

export interface SignTask extends Task<'sign'> {
    type: 'sign'
    creep: string
    source: Id<Source>
    roomName: string
    message: string
}
