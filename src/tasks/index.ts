export interface TransferTask extends Task<'transfer'> {
    type: 'transfer'
    creep: string
    structureId: Id<AnyStoreStructure>
    amount: number
    resourceType: ResourceConstant
    complete: boolean
}
