import { Task } from '../types'

export type MineralWithdrawable = StructureContainer

export interface MineralWithdrawTask extends Task<'mineral-withdraw'> {
    type: 'mineral-withdraw'
    creep: string
    withdrawId: Id<MineralWithdrawable>
    mineralId: Id<Mineral>
    amount: number
    resourceType: ResourceConstant
}
