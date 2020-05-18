export function fromBodyPlan(plan: BodyPartConstant[], capacity: number) {
    const unitCost = plan.reduce((total, p) => total + BODYPART_COST[p], 0)
    let capacityLeft = capacity
    let partsLeft = 50
    let parts: BodyPartConstant[] = []
    while (capacityLeft >= unitCost && partsLeft >= plan.length) {
        parts = parts.concat(plan)
        capacityLeft -= unitCost
        partsLeft -= plan.length
    }
    return parts
}
