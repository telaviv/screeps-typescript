export function fromBodyPlan(
    capacity: number,
    plan: BodyPartConstant[],
    fixed: BodyPartConstant[] = [],
) {
    const fixedCost = fixed.reduce((total, p) => total + BODYPART_COST[p], 0)
    const unitCost = plan.reduce((total, p) => total + BODYPART_COST[p], 0)
    let capacityLeft = capacity - fixedCost
    let partsLeft = 50 - fixed.length
    let parts: BodyPartConstant[] = [...fixed]
    while (capacityLeft >= unitCost && partsLeft >= plan.length) {
        parts = parts.concat(plan)
        capacityLeft -= unitCost
        partsLeft -= plan.length
    }
    return parts
}
