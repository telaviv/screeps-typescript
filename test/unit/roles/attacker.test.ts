import { expect } from 'chai'
import { calculateParts } from '../../../src/roles/attacker'
import { filter } from 'lodash'

describe('attacker', () => {
    describe('calculateParts()', () => {
        it('produces bodies with at least one ATTACK part for valid capacities', () => {
            const checks = [
                { capacity: 130, minAttack: 1 }, // Minimum viable attacker: ATTACK + MOVE
                { capacity: 200, minAttack: 1 },
                { capacity: 300, minAttack: 1 },
                { capacity: 500, minAttack: 1 },
                { capacity: 1000, minAttack: 1 },
            ]

            for (const { capacity, minAttack } of checks) {
                const parts = calculateParts(capacity)
                const attacks = filter(parts, (p) => p === ATTACK)
                expect(attacks.length).to.be.at.least(
                    minAttack,
                    `Capacity ${capacity} should have at least ${minAttack} ATTACK parts`,
                )
            }
        })

        it('returns empty array when capacity is too low for ATTACK + MOVE', () => {
            const checks = [60, 100, 129] // Less than ATTACK(80) + MOVE(50) = 130

            for (const capacity of checks) {
                const parts = calculateParts(capacity)
                expect(parts.length).to.equal(
                    0,
                    `Capacity ${capacity} should return empty array (too low for attacker)`,
                )
            }
        })

        it('includes HEAL part when capacity is sufficient', () => {
            // HEAL(250) + ATTACK(80) + MOVE*2(100) = 430
            const capacity = 430
            const parts = calculateParts(capacity)
            const heals = filter(parts, (p) => p === HEAL)
            expect(heals.length).to.be.at.least(1, 'Should include HEAL part at capacity 430')
        })

        it('does not include HEAL part when capacity is insufficient', () => {
            const capacity = 400 // Less than 430
            const parts = calculateParts(capacity)
            const heals = filter(parts, (p) => p === HEAL)
            expect(heals.length).to.equal(0, 'Should not include HEAL part below capacity 430')
        })

        it('respects maxCopies parameter', () => {
            const capacity = 10000
            const maxCopies = 2
            const parts = calculateParts(capacity, maxCopies)
            const attacks = filter(parts, (p) => p === ATTACK)
            // With maxCopies=2, we should have at most 2 ATTACK parts from the main plan
            // (padding might add more TOUGH/MOVE, but ATTACK should be limited)
            expect(attacks.length).to.be.at.most(
                maxCopies + 1,
                'Should respect maxCopies limit (allowing 1 for heal)',
            )
        })

        it('never produces a body with only TOUGH and MOVE parts', () => {
            // Test various low capacities to ensure we never get TOUGH+MOVE without ATTACK
            const checks = [60, 80, 100, 120, 130, 150, 200]

            for (const capacity of checks) {
                const parts = calculateParts(capacity)
                if (parts.length > 0) {
                    const attacks = filter(parts, (p) => p === ATTACK)
                    const toughs = filter(parts, (p) => p === TOUGH)
                    const moves = filter(parts, (p) => p === MOVE)

                    // If we have TOUGH or MOVE, we must also have ATTACK
                    if (toughs.length > 0 || moves.length > 0) {
                        expect(attacks.length).to.be.at.least(
                            1,
                            `Capacity ${capacity} produced invalid body without ATTACK parts`,
                        )
                    }
                }
            }
        })
    })
})
