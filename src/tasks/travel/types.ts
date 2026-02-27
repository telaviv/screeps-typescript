import { Task } from '../types'

export interface TravelTask extends Task<'travel'> {
    type: 'travel'
    creep: string
    destination: string
    permanent: boolean
    ignoreDenylist?: boolean
}
