import constant from 'lodash/constant'
import times from 'lodash/times'

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

export function byPartCount(parts: Partial<Record<BodyPartConstant, number>>) {
    let plan: BodyPartConstant[] = []
    for (const [part, amount] of Object.entries(parts)) {
        if (amount) {
            plan = plan.concat(
                times(amount, constant(part as BodyPartConstant)),
            )
        }
    }
    return plan
}

export function planCost(plan: BodyPartConstant[]) {
    return plan.reduce((acc, val) => BODYPART_COST[val] + acc, 0)
}
