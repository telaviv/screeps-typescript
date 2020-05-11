import { Task } from '../types'

export type Withdrawable = AnyStoreStructure | Tombstone | Ruin

export interface WithdrawTask extends Task<'withdraw'> {
    type: 'withdraw'
    creep: string
    withdrawId: Id<Withdrawable>
    amount: number
    resourceType: ResourceConstant
}
