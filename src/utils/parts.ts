import * as Logger from 'utils/logger'
import { constant, times } from 'lodash'

/**
 * Creates a body plan for a creep based on the given capacity and body part plan.
 *
 * @param capacity - The maximum energy capacity for the plan
 * @param plan - An array of body part constants representing the desired body part plan.
 * @param fixed - An optional array of body part constants representing the fixed body parts that should be included in the body plan.
 * @param maxCopies - The maximum number of times the plan can be repeated in the body plan.
 * @returns An array of body part constants representing the final body plan for the creep.
 */

interface FromBodyPlanOpts {
    fixed?: BodyPartConstant[]
    maxCopies?: number
    padding?: BodyPartConstant[]
}
export function fromBodyPlan(
    capacity: number,
    plan: BodyPartConstant[],
    { fixed = [], maxCopies = 50, padding = [] }: FromBodyPlanOpts = {},
): BodyPartConstant[] {
    const fixedCost = fixed.reduce((total, p) => total + BODYPART_COST[p], 0)
    const unitCost = plan.reduce((total, p) => total + BODYPART_COST[p], 0)
    let capacityLeft = capacity - fixedCost
    let partsLeft = 50 - fixed.length
    let parts: BodyPartConstant[] = [...fixed]
    let copies = 0
    while (capacityLeft >= unitCost && partsLeft >= plan.length && copies < maxCopies) {
        parts = parts.concat(plan)
        copies++
        capacityLeft -= unitCost
        partsLeft -= plan.length
    }
    if (padding.length > 0) {
        const paddingCost = padding.reduce((total, p) => total + BODYPART_COST[p], 0)
        const paddingCopies = Math.min(
            Math.floor(capacityLeft / paddingCost),
            partsLeft / padding.length,
        )
        for (let i = 0; i < paddingCopies; i++) {
            parts = [...padding, ...parts]
        }
    }
    if (planCost(parts) > capacity) {
        Logger.warning('fromBodyPlan:overcapacity', parts, capacity)
    }
    return parts
}

/**
 * Creates a body plan for a creep with the given capacity, based on the provided plan and fixed body parts.
 *
 * @param capacity - The maximum energy capacity for the plan
 * @param plan - An array of body part constants representing the desired body plan.
 * @param fixed - An optional array of body part constants representing the fixed body parts that should be included in the body plan.
 * @returns The body plan for the creep if it can be created within the given capacity, or null if plan exceeds the capacity.
 */
export function fromBodyPlanSafe(
    capacity: number,
    plan: BodyPartConstant[],
    { fixed = [], maxCopies = 50 }: FromBodyPlanOpts = {},
): BodyPartConstant[] | null {
    const parts = fromBodyPlan(capacity, plan, { fixed, maxCopies })
    if (planCost(parts) > capacity || parts.length === 0) {
        return null
    }
    return parts
}

export function byPartCount(parts: Partial<Record<BodyPartConstant, number>>): BodyPartConstant[] {
    let plan: BodyPartConstant[] = []
    for (const [part, amount] of Object.entries(parts)) {
        if (amount) {
            plan = plan.concat(times(amount, constant(part as BodyPartConstant)))
        }
    }
    return plan
}

export function planCost(plan: BodyPartConstant[]): number {
    return plan.reduce((acc, val) => BODYPART_COST[val] + acc, 0)
}

export function partCount(creep: Creep, part: BodyPartConstant): number {
    return creep.body.filter((p) => p.type === part).length
}
