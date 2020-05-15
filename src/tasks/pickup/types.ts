import { Task } from '../types'

export interface PickupTask extends Task<'pickup'> {
    type: 'pickup'
    creep: string
    resourceId: Id<Resource>
    amount: number
    resourceType: ResourceConstant
}
