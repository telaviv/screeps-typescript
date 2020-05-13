import { Task } from '../types'

export interface TransferTask extends Task<'transfer'> {
    type: 'transfer'
    structureId: Id<AnyStoreStructure>
    amount: number
    resourceType: ResourceConstant
}
